/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {setHomeConfig, getHomeConfig} from "@deepkit/core-node";
import {RoleType, User} from "@deepkit/core";
import {Database} from "@marcj/marshal-mongo";
import {Token, TokenRole} from "./model/token";
import * as os from "os";
import {hash} from "bcryptjs";

export async function setupHomeAccountIfNecessary(database: Database) {
    const homeConfig = await getHomeConfig();

    const account = homeConfig.getAccountByName('localhost');

    let tokenValid = true;
    const users = await database.query(User).sort({created: 'asc'}).limit(1).find();

    if (account) {
        const token = await database.query(Token).filter({token: account.token, role: TokenRole.USER}).findOneOrUndefined();
        if (!token) {
            tokenValid = false;
        }
    }

    if (!users.length) {
        tokenValid = false;
    }

    if (!account) {
        tokenValid = false;
    }

    if (!tokenValid) {
        //when we have no local account yet in ~/.deepkit/config
        //check if in the database we have a user, maybe the user only deleted the config file

        const account = homeConfig.setLocalToken();

        let user = users[0];
        if (users.length === 0) {
            const password = await hash(os.userInfo().username, 10);
            user = new User(os.userInfo().username, os.userInfo().username + '@localhost', RoleType.admin, password);
            user.localUser = true;
            await database.add(user);
            console.log('#######');
            console.log('# User created', os.userInfo().username);
            console.log('#######');
        }

        let token = await database.query(Token).filter({user: user.id, role: TokenRole.USER}).findOneOrUndefined();
        if (!token) {
            token = new Token(user.id, TokenRole.USER);
            await database.add(token);
        }

        account.token = token.token;

        await setHomeConfig(homeConfig);
    }
}
