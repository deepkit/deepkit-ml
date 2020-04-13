/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Action, Controller, ValidationError, EntitySubject} from "@marcj/glut-core";
import {PublicControllerInterface, PublicUser, RoleType, User} from "@deepkit/core";
import {isLocalUser, Role} from "../utils";
import {ClientConnection, EntityStorage} from "@marcj/glut-server";
import {Database} from "@marcj/marshal-mongo";
import {hash} from "bcryptjs";
import {Token, TokenRole} from "../model/token";
import {sleep} from "@marcj/estdlib";
import {f} from "@marcj/marshal";

@Controller('public')
export class PublicController implements PublicControllerInterface {
    constructor(
        private connection: ClientConnection,
        private database: Database,
        private entityStorage: EntityStorage,
    ) {
    }


    @Action()
    @Role(RoleType.anonymouse)
    isLocalUser(): boolean {
        return isLocalUser(this.connection.remoteAddress);
    }


    @Action()
    @Role(RoleType.anonymouse)
    async registerUser(username: string, email: string, password: string): Promise<string> {
        if (await this.database.query(User).filter({username: username}).has()) {
            throw ValidationError.from([{code: 'already_used', path: 'username', message: 'Username already used'}]);
        }

        if (await this.database.query(User).filter({email: email}).has()) {
            throw ValidationError.from([{code: 'already_used', path: 'email', message: 'Email already used'}]);
        }

        await sleep(1);
        const user = new User(username, email, RoleType.regular, await hash(password, 10));
        await this.database.add(user);

        const token = new Token(user.id, TokenRole.USER);
        await this.database.add(token);

        return token.token;
    }

    @Action()
    @Role(RoleType.anonymouse)
    @f.type(PublicUser)
    async subscribeUser(id: string): Promise<EntitySubject<PublicUser> | undefined> {
        return this.entityStorage.findOneOrUndefined(PublicUser, {
            id: id,
            removed: {$ne: true}
        });
    }
}
