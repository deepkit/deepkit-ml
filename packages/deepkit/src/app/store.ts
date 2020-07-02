/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Collection, EntitySubject, IdInterface} from "@marcj/glut-core";
import {Cluster, ClusterNode, FrontendUser, Job, Project, ProjectJobListFilter} from "@deepkit/core";
import {Action, createAction, createReducer, on, props, Store} from '@ngrx/store';
import {classToPlain, f, plainToClass} from "@marcj/marshal";
import {Observable, Subject, Subscriber, TeardownLogic} from "rxjs";
import qs from "qs";

export class MainStore extends Observable<MainStoreInterface> {
    public value!: MainStoreInterface;
    protected lastRAF?: any;

    public readonly onDispatch = new Subject<MainStoreInterface>();

    constructor(
        protected store: Store<{ main: MainStoreInterface }>,
        observerCreator?: (this: Observable<MainStoreInterface>, subscriber: Subscriber<MainStoreInterface>) => TeardownLogic
    ) {
        super(observerCreator);
        this.subscribe((v) => {
            this.value = v;
        });
    }

    dispatch<V extends Action = Action>(action: V) {
        this.store.dispatch(action);
        this.onDispatch.next(this.value);

        if (this.value.user) {
            if (this.lastRAF) cancelAnimationFrame(this.lastRAF);

            this.lastRAF = requestAnimationFrame(() => {
                if (this.value.user) {
                    localStorage.setItem('deepkit/storeMain/' + this.value.user.id, JSON.stringify(classToPlain(MainStoreInterface, this.value)));
                }
            });
        }
    }
}

export type ProjectViewTab = 'experiments' | 'notes' | 'issues' | 'source';

export class ProjectView {
    @f tab: ProjectViewTab = 'experiments';
}

export type ExperimentViewTab = 'channels' | 'parallel' | 'compare';

export class ExperimentView {
    lastSelectedJob?: EntitySubject<Job>;

    @f filter: ProjectJobListFilter = new ProjectJobListFilter();

    @f mode: 'list' | 'detail' = 'list';

    @f tab: ExperimentViewTab = 'channels';

    @f graphsHeight: number = 450;

    @f showGraphs: boolean = true;

    @f.optional() lastSelectedJobId?: string;
}

export class MainStoreInterface {
    user?: FrontendUser;
    projects?: Collection<Project>;
    clusters?: Collection<Cluster>;
    nodes?: Collection<ClusterNode>;
    organisations?: Collection<FrontendUser>;
    activeJobs?: Collection<Job>;

    selected?: EntitySubject<Project> | EntitySubject<Cluster> | EntitySubject<ClusterNode>;
    selectedProject?: EntitySubject<Project>;
    selectedCluster?: EntitySubject<Cluster>;
    selectedNode?: EntitySubject<ClusterNode>;

    @f projectView: ProjectView = new ProjectView;

    @f experimentView: ExperimentView = new ExperimentView;

    @f.optional() lastSelectedId?: string;

    @f.optional()
    lastSelectedType?: 'project' | 'node' | 'cluster';

    @f
    tab: 'projects' | 'cluster' | 'dataset' = 'projects';

    public isClusterSelected(): boolean {
        return !!this.selectedCluster && this.lastSelectedType === 'cluster';
    }

    public isClusterNodeSelected(): boolean {
        return !!this.selectedNode && this.lastSelectedType === 'node';
    }

    public isProjectSelected(id?: string): boolean {
        return !!this.selectedProject && this.lastSelectedType === 'project' && (!id || id === this.lastSelectedId);
    }
}

export const selectEntity = createAction(
    '[Root] Select entity',
    props<{ entity: EntitySubject<Project> | EntitySubject<Cluster> | EntitySubject<ClusterNode> }>()
);

export const loadQueryString = createAction(
    '[Root[ QS',
    props<{qs: string}>()
);

export const loadUserData = createAction(
    '[Root] Load user',
    props<{
        user: FrontendUser,
        projects: Collection<Project>,
        clusters: Collection<Cluster>,
        nodes: Collection<ClusterNode>,
        organisations: Collection<FrontendUser>,
        activeJobs: Collection<Job>,
    }>()
);

export const actionEntityDeleted = createAction(
    '[Root] Entity deleted',
    props<{ entity: IdInterface }>()
);

export const actionExperimentMode = createAction(
    '[Experiment] view mode',
    props<{ mode: 'list' | 'detail', job?: EntitySubject<Job> }>()
);

export const actionLoadAndShowJobId = createAction(
    '[Experiment] load and show experiment',
    props<{ jobId: string }>()
);

export const actionExperimentTab = createAction(
    '[Experiment] tab',
    props<{ tab: ExperimentViewTab}>()
);

export const actionExperimentFilter = createAction(
    '[Experiment] list filter',
    props<{ filter: ProjectJobListFilter }>()
);

export const actionProjectTab = createAction(
    '[Project] tab',
    props<{ tab: ProjectViewTab }>()
);

const reducer = createReducer(
    new MainStoreInterface,
    on(actionProjectTab, (state, props) => {
        state.projectView.tab = props.tab;
        return state;
    }),
    on(actionExperimentMode, (state, props) => {
        state.experimentView.mode = props.mode;

        if (props.job) {
            state.experimentView.lastSelectedJob = props.job;
            state.experimentView.lastSelectedJobId = props.job.id;
        }

        return state;
    }),
    on(actionLoadAndShowJobId, (state, props) => {
        state.experimentView.mode = 'detail';
        state.experimentView.lastSelectedJob = undefined;
        state.experimentView.lastSelectedJobId = props.jobId;

        return state;
    }),
    on(actionExperimentFilter, (state, props) => {
        state.experimentView.filter = props.filter;
        return state;
    }),
    on(actionExperimentTab, (state, props) => {
        state.experimentView.tab = props.tab;
        return state;
    }),
    on(selectEntity, (state, props) => {
        if (props.entity.value instanceof Cluster) {
            state.lastSelectedType = 'cluster';
            state.selectedCluster = props.entity as EntitySubject<Cluster>;
        }

        if (props.entity.value instanceof ClusterNode) {
            state.lastSelectedType = 'node';
            state.selectedNode = props.entity as EntitySubject<ClusterNode>;
        }

        if (props.entity.value instanceof Project) {
            state.lastSelectedType = 'project';
            const project = props.entity as EntitySubject<Project>;

            if (project !== state.selectedProject) {
                //we switched project, so reset experiment view
                state.experimentView.mode = 'list';
                //todo, or should we store it per project?
                delete state.experimentView.lastSelectedJob;
                delete state.experimentView.lastSelectedJobId;
            }

            state.selectedProject = project;

        }

        state.selected = props.entity;
        state.lastSelectedId = props.entity.value.id;
        return state;
    }),
    on(actionEntityDeleted, (state, props) => {
        if (state.experimentView.lastSelectedJob && props.entity instanceof Job
            && props.entity.id === state.experimentView.lastSelectedJob.value.id) {
            delete state.experimentView.lastSelectedJob;
            delete state.experimentView.lastSelectedJobId;
            //we fall back to list when current entity is deleted
            state.experimentView.mode = 'list';
        }

        if (state.selectedProject && props.entity instanceof Project
            && props.entity.id === state.selectedProject.value.id) {
            delete state.selectedProject;
            if (state.lastSelectedType === 'project' && props.entity.id === state.lastSelectedId) {
                delete state.lastSelectedType;
                delete state.lastSelectedId;
            }
        }

        if (state.selectedCluster && props.entity instanceof Cluster
            && props.entity.id === state.selectedCluster.value.id) {
            delete state.selectedCluster;
            if (state.lastSelectedType === 'cluster' && props.entity.id === state.lastSelectedId) {
                delete state.lastSelectedType;
                delete state.lastSelectedId;
            }
        }

        if (state.selectedNode && props.entity instanceof ClusterNode
            && props.entity.id === state.selectedNode.value.id) {
            delete state.selectedNode;
            if (state.lastSelectedType === 'node' && props.entity.id === state.lastSelectedId) {
                delete state.lastSelectedType;
                delete state.lastSelectedId;
            }
        }

        return state;
    }),
    on(loadQueryString, (state, props) => {
        return props.qs ? plainToClass(MainStoreInterface, qs.parse(props.qs, {depth: 20})) : new MainStoreInterface;
    }),
    on(loadUserData, (state, props) => {
        const storeMainStorage = JSON.parse(localStorage.getItem('deepkit/storeMain/' + props.user.id) || 'null');
        const s = storeMainStorage ? plainToClass(MainStoreInterface, storeMainStorage) : new MainStoreInterface;

        s.user = props.user;
        s.projects = props.projects;
        s.clusters = props.clusters;
        s.nodes = props.nodes;
        s.organisations = props.organisations;
        s.activeJobs = props.activeJobs;

        if (s.lastSelectedId) {
            if (s.lastSelectedType === 'project' && s.projects.get(s.lastSelectedId)) {
                s.selected = s.projects.getEntitySubject(s.lastSelectedId) as EntitySubject<Project>;
                s.selectedProject = s.selected as EntitySubject<Project>;
            }
            if (s.lastSelectedType === 'cluster' && s.clusters.get(s.lastSelectedId)) {
                s.selected = s.clusters.getEntitySubject(s.lastSelectedId) as EntitySubject< Cluster>;
                s.selectedCluster = s.selected as EntitySubject<Cluster>;
            }
            if (s.lastSelectedType === 'node' && s.nodes.get(s.lastSelectedId)) {
                s.selected = s.nodes.getEntitySubject(s.lastSelectedId) as EntitySubject<ClusterNode>;
                s.selectedNode = s.selected as EntitySubject<ClusterNode>;
            }
        }

        return s;
    })
);

export function mainStoreReducer(state: MainStoreInterface | undefined, action: Action) {
    return reducer(state, action);
}
