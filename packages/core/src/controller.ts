/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {Observable} from "rxjs";
import {SimplePatches} from "./data";
import {Collection, EntitySubject, StreamBehaviorSubject} from "@marcj/glut-core";
import {HomeAccountConfig, HomeConfig} from "./model/home";
import {Job, JobConfig, JobDebuggingState} from "./model/job";
import {ProjectIssue, ProjectIssueBase, ProjectJobListFilter, Project} from "./model/project";
import {DeepKitFile} from "./model/deepKitFile";
import {Cluster} from "./model/cluster";
import {
    AssignedJobTaskInstance,
    ClusterNode,
    ClusterNodeCredentials, ClusterNodeJobStartConfig,
    NodeHardwareInformation,
    NodeHardwareStats,
    NodeResources
} from "./model/clusterNode";
import {FrontendUser, OrganisationMember, PublicUser, User} from "./model/user";
import {Team} from "./model/team";
import {OrganisationMemberRoleType, RoleType} from "./model/role";
import {SourceFile} from "./model/source";
import {Note} from "./model/note";
import {QueueResult} from "./model/queue";
import {Buffer} from "buffer";
import {UniversalComment} from "./model/comment";

export interface AppAdminControllerInterface {
    deleteCluster(clusterId: string): Promise<void>;

    deleteClusterNode(nodeId: string): Promise<void>;

    getClusterNodeCredentials(nodeId: string): Promise<ClusterNodeCredentials>;

    testClusterNodeSshConnection(host: string, port: number, user: string, password?: string, privateKey?: string, privateKeyPassphrase?: string): Promise<string | undefined>;

    saveClusterNodeCredentials(credentials: ClusterNodeCredentials): Promise<void>;

    createCluster(data: Cluster): Promise<void>;

    createClusterNode(node: ClusterNode, credentials: ClusterNodeCredentials): Promise<void>;

    patchClusterNode(nodeId: string, patches: SimplePatches): Promise<void>;

    stopClusterNode(nodeId: string): Promise<void>;

    closeConnectionClusterNode(nodeId: string): Promise<void>;

    clusterNodeRemoveDockerImage(nodeId: string, imageId: string): Promise<void>;

    clusterNodePruneDockerImages(nodeId: string): Promise<void>;

    clusterNodePruneDockerContainer(nodeId: string): Promise<void>;

    clusterNodeGetDocker(nodeId: string): Promise<{ containers: any[], images: any[] }>;

    clusterNodeInstallDocker(nodeId: string): Promise<Observable<string>>;

    clusterNodeDisableNouveau(nodeId: string): Promise<void>;

    clusterNodeInstallNvidia(nodeId: string): Promise<Observable<string>>;

    clusterNodeCheckDocker(nodeId: string): Promise<void>;

    clusterNodeCheckNvidia(nodeId: string): Promise<void>;

    projectGenerateDeployKey(projectId: string): Promise<string>;

    projectTestGitAccess(projectId: string, gitUrl: string): Promise<boolean>;
}

export interface AppServerAdminControllerInterface {
    getOrganisations(): Promise<Collection<FrontendUser>>;

    getUsers(): Promise<Collection<FrontendUser>>;

    getUser(id: string): Promise<EntitySubject<FrontendUser>>;

    getTeams(organisationId: string): Promise<Collection<Team>>;

    getProjects(userId: string): Promise<Collection<Project>>;

    getAllProjects(): Promise<Collection<Project>>;

    removeUser(userId: string): Promise<void>;

    removeProject(projectId: string): Promise<void>;

    removeOrganisation(organisationId: string): Promise<void>;

    updatePassword(userId: string, password: string): Promise<void>;

    patchUser(userId: string, patches: any): Promise<void>;

    createUser(user: User): Promise<void>;

    createOrganisation(user: FrontendUser): Promise<void>;
}

export interface NodeControllerInterface {
    getSwarm(): Promise<{ host: string, token: string }>;

    getServerIp(): Promise<{ localIp: string, publicIp: string }>;

    lockPeerSpeedTest(peerNodeId: string): Promise<StreamBehaviorSubject<void> | undefined>;

    getPeers(): Promise<{ id: string, ip: string, port: number }[]>;

    // getPeersToSpeedAgainst(): Promise<{ id: string, ip: string, port: number }[]>;

    setPeerSpeed(peerId: string, uploadSpeed: number, downloadSpeed: number): Promise<void>;

    setPeerConnection(peerId: string, ping: number): Promise<void>;

    connected(resources: NodeResources): Promise<string>;

    getStartConfig(): Promise<ClusterNodeJobStartConfig>;

    setResources(resources: NodeResources): Promise<void>;

    setDockerInfo(info: any): Promise<string>;

    setNvidiaInfo(info: any): Promise<string>;

    putStdout(string: string): Promise<void>;

    setNetwork(localIp: string, publicIp: string, speedPort: number): Promise<void>;

    ready(): Promise<void>;

    jobTaskInstanceDone(jobId: string, task: string, instance: number): Promise<void>;

    getAssignedTaskInstances(): Promise<AssignedJobTaskInstance[]>;

    getNodeId(): Promise<string>;

    isTaskInstanceAllowedToStartThenStart(id: string, task: string, instance: number): Promise<boolean>;

    setHardwareInformation(information: NodeHardwareInformation): Promise<void>;

    streamStats(stats: NodeHardwareStats): Promise<void>;
}

export interface JobControllerInterface {
    missingFiles(md5s: string[]): Promise<string[]>;

    jobUploadFile(task: string, instance: number, path: string, md5: string, content: string): Promise<boolean>;

    jobRegisterFile(task: string, instance: number, path: string, md5: string): Promise<boolean>;

    patchJob(patches: SimplePatches): Promise<number>;

    getProjectName(): Promise<string>;

    taskInstanceStarted(taskName: string, taskInstance: number): Promise<void>;

    taskInstanceEnded(taskName: string, taskInstance: number): Promise<void>;

    uploadFile(path: string, content: string): Promise<boolean>;

    getJob(): Promise<Job | undefined>;

    getJobFileContent(filePath: string): Promise<string | undefined>;

    streamInternalFile(path: string, data: ArrayBuffer): Promise<boolean>;

    log(name: string, content: string): Promise<boolean>;

    getJobFiles(): Promise<DeepKitFile[]>;

    channelData(channelName: string, data: ArrayBuffer): Promise<boolean>;

    streamJsonFile(path: string, rows: any[][]): Promise<boolean>;
}

export interface PublicControllerInterface {
    isLocalUser(): boolean;

    registerUser(username: string, email: string, password: string): Promise<string>;

    subscribeUser(id: string): Promise<EntitySubject<PublicUser> | undefined>;
}

export interface LocalControllerInterface {
    getAccounts(): Promise<HomeAccountConfig[]>;

    getDeepkitCliInfo(): Promise<{path: string, platform: string}>;

    saveAccounts(accounts: HomeAccountConfig[]): Promise<void>;

    setSourceFolder(accountId: string, projectId: string, oldPath: string, path: string, name: string, bookmarkPermission?: string): Promise<void>;

    getSourceFolder(projectId: string): Promise<string>;

    subscribeSourceFiles(projectId: string, folder?: string): Promise<Collection<SourceFile>>;

    getExperimentConfigs(projectId: string): Promise<JobConfig[]>;

    deleteSourceFile(projectId: string, path: string): Promise<void>;

    createSourceFolder(projectId: string, path: string): Promise<void>;

    createSourceFile(projectId: string, path: string, content: string): Promise<void>;

    renameSourceFile(projectId: string, path: string, newPath: string): Promise<void>;

    subscribeSourceFileContent(projectId: string, path: string): Promise<StreamBehaviorSubject<Buffer | undefined>>;

    subscribeFolderChange(projectId: string): Promise<StreamBehaviorSubject<string>>;

    saveSourceFileContent(projectId: string, path: string, content: string): Promise<void>;

    createExperiment(projectId: string, runOnCluster: boolean, config: JobConfig): Promise<void>;
}

export interface PermissionControllerInterface {
    checkNoteReadAccess(noteId: string): Promise<boolean>;

    checkNoteWriteAccess(noteId: string): Promise<boolean>;

    checkProjectReadAccess(projectId: string): Promise<boolean>;

    checkProjectWriteAccess(projectId: string): Promise<boolean>;

    checkProjectAdminAccess(projectId: string): Promise<boolean>;
}

export interface NoteControllerInterface {
    noteObservable(noteId: string): Promise<Observable<any>>;

    updateCursor(noteId: string, range?: any): Promise<void>;

    applyDeltas(noteId: string, deltaOps: any[]): Promise<void>;

    deleteNote(projectId: string, noteId: string): Promise<void>;

    getNotes(projectId: string): Promise<Collection<Note>>;

    addNote(note: Note): Promise<void>;

    patchNote(projectId: string, noteId: string, patches: SimplePatches): Promise<void>;

    readNote(projectId: string, noteId: string): Promise<any[]>;
}

export interface IssueControllerInterface {
    subscribeIssues(projectId: string): Promise<Collection<ProjectIssue>>;

    subscribeFiles(issueId: string): Promise<Collection<DeepKitFile>>;

    subscribeFileContent(issueId: string, path: string): Promise<StreamBehaviorSubject<Uint8Array | undefined>>;

    add(issue: ProjectIssueBase): Promise<string>;

    save(issue: ProjectIssueBase): Promise<void>;

    subscribeComments(issueId: string): Promise<Collection<UniversalComment>>;

    addComment(issueId: string, content: any[]): Promise<void>;

    removeComment(issueId: string, id: string): Promise<void>;

    editComment(issueId: string, id: string, content: any[]): Promise<void>;

    patch(id: string, issue: Partial<ProjectIssueBase>): Promise<void>;

    addFile(id: string, name: string, data: Uint8Array): Promise<void>;

    removeFile(id: string, path: string): Promise<void>;

    archive(id: string): Promise<void>;

    remove(id: string): Promise<void>;
}

export interface AppControllerInterface {
    isServerMode(): Promise<boolean>;

    login(username: string, password: string): Promise<string>;

    getSessionId(): Promise<string>;

    getSessionRole(): Promise<RoleType>;

    getAuthenticatedUser(): Promise<EntitySubject<FrontendUser>>;

    getUser(): Promise<EntitySubject<FrontendUser>>;

    getMyOrganisations(): Promise<Collection<FrontendUser>>;

    updatePassword(userId: string, password: string): Promise<void>;

    updateUser(user: FrontendUser): Promise<void>;

    getProjects(): Promise<Collection<Project>>;

    findUser(query: string, global: boolean): Promise<PublicUser[]>;

    getCluster(id: string): Promise<Cluster | undefined>;

    getClusters(): Promise<Collection<Cluster>>;

    getNodes(): Promise<Collection<ClusterNode>>;

    stopJob(jobId: string, force?: boolean): Promise<void>;

    patchCluster(clusterId: string, patches: SimplePatches): Promise<number>;

    patchJob(jobId: string, patches: SimplePatches): Promise<number>;

    updateProject(project: Project): Promise<void>;

    createExperiment(projectId: string, config: JobConfig): Promise<string>;

    createOrganisation(user: FrontendUser): Promise<void>;

    getOrganisationMembers(organisationId: string): Promise<Collection<FrontendUser>>;

    getOrganisationMember(userId: string, organisationId: string): Promise<EntitySubject<OrganisationMember>>;

    assignMemberToOrganisation(organisationId: string, userId: string, role: OrganisationMemberRoleType): Promise<void>;

    unAssignMemberOfOrganisation(organisationId: string, userId: string): Promise<void>;

    deleteJobs(jobIds: string[]): Observable<string>;

    jobsCountPerProject(projectId: string): any;

    getHomeConfig(): Promise<HomeConfig>;

    createProject(name: string, location?: string, bookmarkPermission?: string): Promise<string>;

    restartJob(id: string): Promise<boolean>;

    jobDebugStartWatchLayer(jobId: string, layerId: string): Promise<void>;

    jobSetDebuggingState(jobId: string, state: JobDebuggingState): Promise<void>;

    jobDebugStopWatchLayer(jobId: string, layerId: string): Promise<void>;

    deleteJob(id: string): Promise<boolean>;

    deleteProject(id: string): Promise<boolean>;

    getProjectForId(id: string): Promise<Project | undefined>;

    getProjectName(id: string): Promise<string | undefined>;

    subscribeProject(id: string): Promise<EntitySubject<Project>>;

    subscribeCluster(id: string): Promise<EntitySubject<Cluster>>;

    subscribeClusterNode(id: string): Promise<EntitySubject<ClusterNode>>;

    subscribeClusterNodeStdout(nodeId: string): Promise<StreamBehaviorSubject<Uint8Array | undefined>>;

    getProjectForPublicName(nameWithNamespace: string): Promise<Project | undefined>;

    createProjectForName(nameWithNamespace: string): Promise<string>;

    isAllowedToCreateProjectByName(nameWithNamespace: string): Promise<boolean>;

    getJobs(project: string, list: undefined | string | 'ci'): Promise<Collection<Job>>;

    getActiveJobs(project?: string): Promise<Collection<Job>>;

    getJobsForCluster(cluster: string): Promise<Collection<Job>>;

    getJob(id: string): Promise<Job | undefined>;

    subscribeClosedJobFiles(jobId: string): Promise<Collection<DeepKitFile>>;

    getJobAccessToken(jobId: string): Promise<string | undefined>;

    jobFileExists(jobId: string, filePath: string): Promise<boolean>;

    jobs(projectId: string): Promise<Job[]>;

    jobUploadFile(jobId: string, path: string, md5: string, content: string): Promise<boolean>;

    jobRegisterFile(jobId: string, path: string, md5: string): Promise<boolean>;

    missingFiles(md5s: string[]): Promise<string[]>;

    addJob(data: Partial<Job>): Promise<boolean>;

    queueJob(jobId: string, priority: number): Promise<QueueResult[]>;

    projectGitRefresh(projectId: string): Promise<void>;

    projectGitFiles(projectId: string, branch: string, path: string): Promise<SourceFile[]>;

    projectGitFileUtf8Content(projectId: string, branch: string, path: string): Promise<string | undefined>;

    projectGitExperimentFiles(projectId: string, branch: string): Promise<JobConfig[]>;

    startJobSharing(jobId: string): Promise<void>;

    stopJobSharing(jobId: string): Promise<void>;
}

export interface ProjectControllerInterface {
    addFilter(projectId: string, filter: ProjectJobListFilter): Promise<void>;

    deleteFilter(projectId: string, filterId: string): Promise<void>;

    addExperimentLabel(projectId: string, name: string): Promise<string>;

    addExperimentList(projectId: string, name: string): Promise<void>;

    changeExperimentListName(projectId: string, listId: string, name: string): Promise<void>;

    subscribePublicProject(username: string, projectName: string): Promise<EntitySubject<Project>>;
}

export interface PublicJobControllerInterface {
    authorizeConnection(id: string, token: string): Promise<void>;

    subscribeJob(id: string): Promise<EntitySubject<Job>>;

    subscribeProjectForJob(jobId: string): Promise<EntitySubject<Project>>;

    // subscribeJobLiveGraphSnapshots(jobId: string): Promise<Collection<JobModelGraphSnapshot>>;

    // subscribeJobLiveGraphSnapshot(jobId: string): Promise<EntitySubject<JobModelGraphSnapshot>>;

    getJobFileContent(jobId: string, filePath: string): Promise<Buffer | undefined>;

    getJobFileTextContent(jobId: string, path: string): Promise<string | undefined>;

    subscribeJobFiles(jobId: string): Promise<Collection<DeepKitFile>>;

    subscribeInsights(jobId: string, x: number): Promise<Collection<DeepKitFile>>;

    subscribeJobLiveDebugData(jobId: string, path: string): Promise<StreamBehaviorSubject<Uint8Array | undefined>>;

    subscribeJobFileContent(jobId: string, filePath: string): Promise<StreamBehaviorSubject<Uint8Array | undefined>>;
}
