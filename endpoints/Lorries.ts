import { Connection } from "mysql";
import { doQuery, checkResponseErrors } from "../Common/AwaitableSQL";
import { OUT_Lorry, IN_Lorry } from "../Common/DTO/Lorry";
import { OUT_WeightClassfy } from "../Common/DTO/WeightClassfy";
import { GetCorrals } from "./Corrals";
import { GetOrigins } from "./Origins";
import { OUT_Corral } from "../Common/DTO/Corral";
import { OUT_Origin } from "../Common/DTO/Origin";
import { OUT_Provider } from "../Common/DTO/Provider";
import { DateTimeOps } from "../Common/DateTimeOps";
import { GetProviders } from "./Providers";
import { Router } from "express";
import { Telemetry } from "../Common/Telemetry";

export async function GetLorries(dbConn: Connection, ids: Array<string>){
    if(ids.length == 0){
        return [];
    }
    let qr = await doQuery(dbConn, `
        SELECT l.*, COUNT(wc.id_weight_class) as cls_cnt, GROUP_CONCAT(wc.id_weight_class) as cls_ids, GROUP_CONCAT(wc.name) as cls_names,
            GROUP_CONCAT(wc.heads) as cls_heads, GROUP_CONCAT(wc.cost) as cls_cost, GROUP_CONCAT(wc.sex) as cls_sex 
        FROM lorries l 
        LEFT JOIN weight_class wc ON wc.id_lorries = l.id_lorries 
        WHERE l.id_lorries IN (?) 
        GROUP BY l.id_lorries; 
    `, [ids]);

    if(qr.error){
        return qr.error;
    }
    let qrr = qr.result;

    let lorries = new Array<OUT_Lorry>();

    for (let i = 0; i < qrr.length; i++) {
        const el = qrr[i];
        let classes = new Array<OUT_WeightClassfy>();
        if(el.cls_cnt > 0){
            let cls_ids = el.cls_ids.split(",");
            let cls_names = el.cls_names.split(",");
            let cls_heads = el.cls_heads.split(",");
            let cls_cost = el.cls_cost.split(",");
            let cls_sex = el.cls_sex.split(",");

            for (let i = 0; i < el.cls_cnt; i++) {
                let clss: OUT_WeightClassfy = {
                    cost: cls_cost[i],
                    heads: cls_heads[i],
                    id: cls_ids[i],
                    name: cls_names[i],
                    sex: cls_sex[i]
                }
                classes.push(clss);
            }
        }

        let corralResponse = await GetCorrals(dbConn, [el.idStayCorral]);
        let originResponse = await GetOrigins(dbConn, [el.id_origins]);
        let providerResponse = await GetProviders(dbConn, [el.id_providers]);
        let errors = checkResponseErrors(corralResponse, originResponse, providerResponse);
        if(errors != null){
            return errors;
        }

        if((corralResponse as Array<OUT_Corral>).length == 0){
            return {e: "No Corral", info: "No Protocol"}
        }
        if((originResponse as Array<OUT_Origin>).length == 0){
            return {e: "No Origin", info: "No Corral"}
        }
        if((providerResponse as Array<OUT_Provider>).length == 0){
            return {e: "No Provider", info: "No Corral"}
        }

        let openDays = -1;
        if(el.workDate != null){
            openDays = DateTimeOps.daysBetween(
                new Date(el.workDate), new Date(el.arrivalDate));
        }

        let lorry: OUT_Lorry = {
            femaleClassfies: classes.filter((el)=>el.sex == "female"),
            maleClassfies: classes.filter((el)=>el.sex == "male"),
            arrivalDate: el.arrivalDate,
            entryCorral: (corralResponse as Array<OUT_Corral>)[0],
            origin: (originResponse as Array<OUT_Origin>)[0],
            provider: (providerResponse as Array<OUT_Provider>)[0],
            id: el.id_lorries,
            maxHeads: el.heads,
            plateNum: el.plate,
            weight: el.arrivalWeight,
            openDays: openDays
        }
        
        lorries.push(lorry);
    }

    return lorries;
}

export function Lorries(router: Router, dbConn: Connection, tl: Telemetry){
    router.get("/", async (req, res) => {
        let qr = await doQuery(dbConn, `
            SELECT id_lorries FROM lorries;
        `, []);
        if(qr.error){
            tl.reportInternalError(res, qr.error);
            return;
        }

        let ids = qr.result;
        console.log(ids);
        
        let lorries = new Array<OUT_Lorry>();
        if(ids.length != 0){
            let lorriesResponse = await GetLorries(dbConn, ids.map((v:any) => v.id_lorries));
            let responseLorries = (lorriesResponse as Array<OUT_Lorry>);


            if(responseLorries.length == undefined){
                let error = lorriesResponse as {e:any, info: string};
                tl.reportInternalError(res, error.e);
                return;
            }
            lorries = responseLorries;
        }
        
        
        res.send(lorries);
    });
    router.post("/", async (req, res) => {
        let p = req.body as IN_Lorry;
        let date = new Date().getTime().toString();

        let qr = await doQuery(dbConn, `
            INSERT INTO lorries 
                (plate, id_origins, id_providers, heads, 
                    arrivalWeight, idStayCorral, arrivalDate,
                    create_datetime, edit_datetime) 
                VALUES (?,?,?,?,?,?,?,?,?);
        `,[p.plateNum, p.origin, p.provider, p.maxHeads,
            p.weight, p.entryCorral, p.arrivalDate,
            date, date]);

        if(qr.error){
            tl.reportInternalError(res, qr.error);
            return;
        }

        let idLorry = qr.result.insertId;

        let allClassfies = p.maleClassfies.concat(p.femaleClassfies);
        let values_str = "";
        let values_arr = [];
        for (let i = 0; i < allClassfies.length; i++) {
            if(i != 0){
                values_str += ",";
            }
            const el = allClassfies[i];
            values_arr.push(idLorry, el.name, el.heads, el.cost, el.sex, date);
            values_str += "(?,?,?,?,?,?)"; 
        }

        let classfyQr = await doQuery(dbConn, `
            INSERT INTO weight_class 
                (id_lorries, name, heads, cost, sex, create_datetime) VALUES 
                :values:;
        `.replace(":values:", values_str)
        , values_arr);

        if(classfyQr.error){
            tl.reportInternalError(res, classfyQr.error);
            console.log(classfyQr.obj.sql);
            
            return;
        }

        res.send();

    })
    return router;
}