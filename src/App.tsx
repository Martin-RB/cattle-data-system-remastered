// Cambios Daniel
import { render } from "react-dom";
import React from "react";
import {
    BrowserRouter as Router,
    Switch,
    Route,
    Link,
    RouteComponentProps,
    match,
    Redirect,
    BrowserRouter,
} from "react-router-dom";
import { History } from "history";
import { isLoggedIn, Login } from "./Screens/Login";
import { Menu } from "./Screens/Menu";
import { UserAdmin } from "./Screens/UserAdmin";
import M from "materialize-css";
import cookie from 'react-cookies';

export var HISTORY: History;
export var MATCH: match;

export var historyRefresher = (r: RouteComponentProps, child: JSX.Element) => {
    HISTORY = r.history;
    MATCH = r.match;

    return child;
};

export function toast(message: string) {
    M.toast({ html: message });
}


let view = (
    <BrowserRouter>
        <Switch>

            <Route
                exact
                path="/"
                render={(a) => historyRefresher(a, <Redirect to="/login" />)}
            />
            <Route
                exact
                path="/login"
                render={(a) => (<Login status={true} {...a}/>)}
            />
            <Route
                exact
                path="/admon"
                render={(a) => historyRefresher(a, <UserAdmin />)}
            />
            <Route
                path="/menu"
                render={(a) => {
                    console.log("menu", isLoggedIn());
                    
                    return (
                    isLoggedIn() ?
                    <Menu {...a}/>: <Redirect to="/login" /> 
                    )
                    
                }}
            />
        </Switch>
    </BrowserRouter>
);

render(view, document.getElementById("app"));