/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import * as job from './model/job';
import * as project from './model/project';
import * as clusterNode from './model/clusterNode';
import * as deepKitFile from './model/deepKitFile';
import * as home from './model/home';
import * as user from './model/user';
import * as cluster from './model/cluster';
import * as team from './model/team';
import * as source from './model/source';
import * as note from './model/note';
import * as queue from './model/queue';
import * as comment from './model/comment';

export function registerModels() {
    const models = [job, project, clusterNode, deepKitFile, home, user, cluster, team, source, note, queue, comment, project.ProjectIssue];
    //do nothing with it
}
