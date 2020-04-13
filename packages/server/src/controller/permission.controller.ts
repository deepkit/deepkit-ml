/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Action, Controller} from "@marcj/glut-core";
import {PermissionControllerInterface} from "@deepkit/core";
import {SessionPermissionManager} from "../manager/session-permission";
import {Role} from "../utils";
import {RoleType} from "@deepkit/core";

@Controller('permission')
export class PermissionController implements PermissionControllerInterface {
    constructor(
        private permission: SessionPermissionManager,
    ) {
    }

    protected async check(cb: () => Promise<any>): Promise<boolean> {
        try {
            await cb();
            return true;
        } catch (error) {
            return false;
        }
    }

    @Action()
    @Role(RoleType.anonymouse)
    async checkNoteReadAccess(noteId: string): Promise<boolean> {
        return await this.check(async () => await this.permission.checkNoteReadAccess(noteId));
    }

    @Action()
    @Role(RoleType.anonymouse)
    async checkNoteWriteAccess(noteId: string): Promise<boolean> {
        return await this.check(async () => await this.permission.checkNoteWriteAccess(noteId));
    }

    @Action()
    @Role(RoleType.anonymouse)
    async checkProjectReadAccess(projectId: string): Promise<boolean> {
        return await this.check(async () => await this.permission.checkProjectReadAccess(projectId));
    }

    @Action()
    @Role(RoleType.anonymouse)
    async checkProjectWriteAccess(projectId: string): Promise<boolean> {
        return await this.check(async () => await this.permission.checkProjectWriteAccess(projectId));
    }

    @Action()
    @Role(RoleType.anonymouse)
    async checkProjectAdminAccess(projectId: string): Promise<boolean> {
        return await this.check(async () => await this.permission.checkProjectAdminAccess(projectId));
    }
}
