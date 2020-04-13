/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {
    AppAdminControllerInterface,
    Cluster,
    ClusterNode,
    ClusterNodeCredentials,
    NodePeerControllerInterface,
    Project,
    ProjectSource,
    RoleType,
    SimplePatches
} from "@deepkit/core";
import {Subscriptions} from "@marcj/estdlib-rxjs";
import {Database} from "@marcj/marshal-mongo";
import {EntityStorage, Exchange, ExchangeDatabase, InternalClient} from "@marcj/glut-server";
import {Action, Controller} from "@marcj/glut-core";
import {Role} from "../utils";
import {detectOS, Provision, SshConnection} from "@deepkit/core-node";
import {SessionPermissionManager} from "../manager/session-permission";
import * as stream from "stream";
import {Observable} from "rxjs";
import {SessionHelper} from "../session";
import {f} from "@marcj/marshal";
import * as forge from 'node-forge';
import {ProjectManager} from "../manager/project-manager";

@Controller('admin')
export class AdminController implements AppAdminControllerInterface {
    private subs = new Subscriptions();

    constructor(
        private sessionHelper: SessionHelper,
        private database: Database,
        private exchangeDatabase: ExchangeDatabase,
        private exchange: Exchange,
        private entityStorage: EntityStorage,
        private projectManager: ProjectManager,
        private permission: SessionPermissionManager,
        private internalClient: InternalClient,
    ) {
    }

    public async destroy() {
        this.subs.unsubscribe();
    }

    private getUserId(): string {
        return this.sessionHelper.getUserSession().chosenOrganisationOrUserId;
    }

    @Action()
    @Role(RoleType.regular)
    async deleteClusterNode(nodeId: string): Promise<void> {
        await this.permission.checkClusterNodeAdminAccess(nodeId);

        await this.stopClusterNode(nodeId);
        await this.closeConnectionClusterNode(nodeId);

        await this.exchangeDatabase.remove(ClusterNode, nodeId);
        await this.database.query(ClusterNodeCredentials).filter({nodeId: nodeId}).deleteOne();
    }

    @Action()
    @Role(RoleType.admin)
    async getGoogleCloudZones(): Promise<void> {
    }

    @Action()
    @Role(RoleType.admin)
    async getGoogleCloudMachineTypes(): Promise<void> {
        //which machine supports what GPU?
        //https://cloud.google.com/compute/docs/reference/rest/v1/acceleratorTypes/list?apix_params=%7B%22project%22%3A%22marc-167410%22%2C%22zone%22%3A%22us-west1-b%22%7D
    }

    @Action()
    @Role(RoleType.admin)
    async getGoogleCloudPrices(): Promise<void> {
        //https://console.cloud.google.com/m/price_list?folder&organizationId

        //standard persistent disk
        //CP-COMPUTEENGINE-STORAGE-PD-CAPACITY

        //ssd
        //CP-COMPUTEENGINE-STORAGE-PD-SSD

        //vm instance price
        //CP-COMPUTEENGINE-VMIMAGE-<id>
        //gpu
        //GPU_NVIDIA_TESLA_P100
        //GPU_NVIDIA_TESLA_T4
        //GPU_NVIDIA_TESLA_V100
        //GPU_NVIDIA_TESLA_K80
    }

    @Action()
    @Role(RoleType.regular)
    async deleteCluster(clusterId: string): Promise<void> {
        await this.permission.checkClusterAdminAccess(clusterId);

        const nodes = await this.database.query(ClusterNode).filter({cluster: clusterId}).find();

        for (const node of nodes) {
            await this.stopClusterNode(node.id);
            await this.closeConnectionClusterNode(node.id);
            await this.exchangeDatabase.remove(ClusterNode, node.id);
            await this.database.query(ClusterNodeCredentials).filter({nodeId: node.id}).deleteOne();
        }

        await this.exchangeDatabase.remove(Cluster, clusterId);
    }

    @Action()
    @Role(RoleType.regular)
    @f.type(ClusterNodeCredentials)
    async getClusterNodeCredentials(nodeId: string): Promise<ClusterNodeCredentials> {
        await this.permission.checkClusterNodeAdminAccess(nodeId);

        let credentials = await this.database.query(ClusterNodeCredentials).filter({
            nodeId: nodeId,
        }).findOne();

        if (!credentials) {
            credentials = new ClusterNodeCredentials(nodeId);
            await this.database.add(credentials);
        }

        return credentials;
    }

    @Action()
    @Role(RoleType.regular)
    async createCluster(cluster: Cluster) {
        await this.permission.checkAdminAccessByUserId(this.getUserId());
        cluster.owner = this.getUserId();
        await this.exchangeDatabase.add(cluster);
    }

    @Action()
    @Role(RoleType.regular)
    async testClusterNodeSshConnection(host: string, port: number, user: string, password?: string, privateKey?: string, privateKeyPassphrase?: string): Promise<string> {
        await this.permission.checkAdminAccessByUserId(this.getUserId());

        const connection = new SshConnection(host, port, user, password, privateKey, privateKeyPassphrase);

        await connection.connect();
        const os = await detectOS(connection);
        connection.disconnect();

        return os.osType;
    }

    @Action()
    @Role(RoleType.regular)
    async saveClusterNodeCredentials(credentials: ClusterNodeCredentials): Promise<void> {
        await this.permission.checkClusterNodeAdminAccess(credentials.nodeId);

        await this.permission.checkClusterNodeAdminAccess(credentials.nodeId);
        await this.database.update(credentials);
    }

    @Action()
    @Role(RoleType.regular)
    async createClusterNode(node: ClusterNode, credentials: ClusterNodeCredentials): Promise<void> {
        await this.permission.checkClusterAdminAccess(node.cluster);
        node.owner = this.getUserId();
        await this.exchangeDatabase.add(node);

        credentials.nodeId = node.id;
        await this.database.add(credentials);
    }

    @Action()
    @Role(RoleType.regular)
    async patchClusterNode(nodeId: string, @f.partial(ClusterNode) patches: SimplePatches): Promise<void> {
        await this.permission.checkClusterNodeAdminAccess(nodeId);
        if (patches.cluster) {
            await this.permission.checkClusterAdminAccess(patches.cluster);
        }
        delete patches['owner'];
        if (Object.keys(patches).length) {
            await this.exchangeDatabase.patch(ClusterNode, nodeId, patches);
            const node = await this.database.query(ClusterNode).filter({id: nodeId}).findOne();
            if (node.disabled) {
                this.stopClusterNode(nodeId).catch(console.error);
                this.closeConnectionClusterNode(nodeId).catch(console.error);
            } else {
                const internal = this.internalClient.create();
                const nodeController = internal.peerController<NodePeerControllerInterface>('node/' + nodeId);
                nodeController.loadStartConfig().catch(console.error);
                internal.destroy();
            }
        }
    }

    @Action()
    @Role(RoleType.regular)
    async stopClusterNode(nodeId: string): Promise<void> {
        await this.permission.checkClusterNodeAdminAccess(nodeId);

        const internal = this.internalClient.create();
        const nodeController = internal.peerController<NodePeerControllerInterface>('node/' + nodeId);
        //we don't close the tunnel per default, as we don't know when the server successfully disconnected
        // and we don't want to close the connection before he is done, as this would lead to an error message
        nodeController.stop().then(() => {
        }, (error) => {
            console.log(`could not stop node ${nodeId}: ${error}`);
        });
        internal.destroy();
    }

    @Action()
    @Role(RoleType.regular)
    async closeConnectionClusterNode(nodeId: string): Promise<void> {
        await this.permission.checkClusterNodeAdminAccess(nodeId);
        await this.exchange.publish('node/tunnel-close/' + nodeId, {close: true});
    }

    @Action()
    @Role(RoleType.regular)
    async clusterNodeCheckDocker(nodeId: string): Promise<void> {
        await this.permission.checkClusterNodeAdminAccess(nodeId);

        await this.internalClient.auto<NodePeerControllerInterface>('node/' + nodeId, async (controller) => {
            await controller.checkDocker();
        });
    }

    @Action()
    @Role(RoleType.regular)
    async clusterNodeCheckNvidia(nodeId: string): Promise<void> {
        await this.permission.checkClusterNodeAdminAccess(nodeId);

        await this.internalClient.auto<NodePeerControllerInterface>('node/' + nodeId, async (controller) => {
            await controller.checkNvidia();
        });
    }

    @Action()
    @Role(RoleType.regular)
    async clusterNodeRemoveDockerImage(nodeId: string, imageId: string): Promise<void> {
        await this.permission.checkClusterNodeAdminAccess(nodeId);

        await this.internalClient.auto<NodePeerControllerInterface>('node/' + nodeId, async (controller) => {
            await controller.removeDockerImage(imageId);
        });
    }

    @Action()
    @Role(RoleType.regular)
    async clusterNodePruneDockerImages(nodeId: string): Promise<void> {
        await this.permission.checkClusterNodeAdminAccess(nodeId);

        await this.internalClient.auto<NodePeerControllerInterface>('node/' + nodeId, async (controller) => {
            await controller.pruneDockerImages();
        });
    }

    @Action()
    @Role(RoleType.regular)
    async clusterNodePruneDockerContainer(nodeId: string): Promise<void> {
        await this.permission.checkClusterNodeAdminAccess(nodeId);

        await this.internalClient.auto<NodePeerControllerInterface>('node/' + nodeId, async (controller) => {
            await controller.pruneDockerContainer();
        });
    }

    @Action()
    @Role(RoleType.regular)
    @f.any()
    async clusterNodeGetDocker(nodeId: string): Promise<{ containers: any[], images: any[] }> {
        await this.permission.checkClusterNodeAdminAccess(nodeId);

        return await this.internalClient.auto<NodePeerControllerInterface>('node/' + nodeId, async (controller) => {
            return {
                containers: await controller.getDockerContainer(),
                images: await controller.getDockerImages(),
            };
        });
    }

    @Action()
    @Role(RoleType.regular)
    async clusterNodeInstallDocker(nodeId: string): Promise<Observable<string>> {
        await this.permission.checkClusterNodeAdminAccess(nodeId);

        const node = await this.database.query(ClusterNode).filter({id: nodeId}).findOne();

        const credentials = await this.database.query(ClusterNodeCredentials).filter({nodeId: nodeId}).findOneOrUndefined();
        if (!credentials) {
            throw new Error('No credentials found.');
        }

        return new Observable((observer) => {
            const connection = new SshConnection(
                node.host,
                credentials.sshPort,
                credentials.sshUsername,
                credentials.sshPassword,
                credentials.sshPrivateKey,
                credentials.sshPrivateKeyPassphrase,
            );

            const s = new stream.Writable({
                write: function (chunk: string | Buffer, encoding: any, next: any) {
                    observer.next(chunk instanceof Buffer ? chunk.toString('utf8') : chunk);
                    next();
                },
            });

            const provision = new Provision(connection, s);

            provision.installDocker(credentials.sshRequiresSudo).then(() => {
                observer.complete();
            }, (error) => {
                observer.error(error);
            });
        });
    }

    @Action()
    @Role(RoleType.regular)
    async clusterNodeDisableNouveau(nodeId: string): Promise<void> {
        await this.permission.checkClusterNodeAdminAccess(nodeId);
        const node = await this.database.query(ClusterNode).filter({id: nodeId}).findOne();

        const credentials = await this.database.query(ClusterNodeCredentials).filter({nodeId: nodeId}).findOneOrUndefined();
        if (!credentials) {
            throw new Error('No credentials found.');
        }

        const connection = new SshConnection(
            node.host,
            credentials.sshPort,
            credentials.sshUsername,
            credentials.sshPassword,
            credentials.sshPrivateKey,
            credentials.sshPrivateKeyPassphrase,
        );

        const provision = new Provision(connection);

        await provision.disableNouveau(credentials.sshRequiresSudo);
    }

    @Action()
    @Role(RoleType.regular)
    async clusterNodeInstallNvidia(nodeId: string): Promise<Observable<string>> {
        await this.permission.checkClusterNodeAdminAccess(nodeId);
        const node = await this.database.query(ClusterNode).filter({id: nodeId}).findOne();

        const credentials = await this.database.query(ClusterNodeCredentials).filter({nodeId: nodeId}).findOneOrUndefined();
        if (!credentials) {
            throw new Error('No credentials found.');
        }

        return new Observable((observer) => {
            const connection = new SshConnection(
                node.host,
                credentials.sshPort,
                credentials.sshUsername,
                credentials.sshPassword,
                credentials.sshPrivateKey,
                credentials.sshPrivateKeyPassphrase,
            );

            const s = new stream.Writable({
                write: function (chunk: string | Buffer, encoding: any, next: any) {
                    observer.next(chunk instanceof Buffer ? chunk.toString('utf8') : chunk);
                    next();
                },
            });

            const provision = new Provision(connection, s);

            provision.installNvidia(credentials.sshRequiresSudo).then(() => {
                observer.complete();
            }, (error) => {
                observer.error(error);
            });
        });
    }

    @Action()
    @Role(RoleType.regular)
    async projectGenerateDeployKey(projectId: string): Promise<string> {
        await this.permission.checkProjectAdminAccess(projectId);

        let projectSource = await this.database.query(ProjectSource).filter({projectId: projectId}).findOneOrUndefined();
        if (!projectSource || !projectSource.privateKey) {
            projectSource = new ProjectSource(projectId);
            const keypair: forge.pki.KeyPair = await new Promise((resolve, reject) => {
                forge.pki.rsa.generateKeyPair({}, (err, keypair) => {
                    if (err) reject(err);
                    resolve(keypair);
                });
            });
            projectSource.privateKey = forge.pki.privateKeyToPem(keypair.privateKey);
            await this.database.add(projectSource);
        }

        const privateKey = forge.pki.privateKeyFromPem(projectSource.privateKey) as forge.pki.rsa.PrivateKey;
        const publicKey = forge.pki.rsa.setPublicKey(privateKey.n, privateKey.e);

        const deployKey = forge.ssh.publicKeyToOpenSSH(publicKey, '');

        await this.database.query(Project).filter({id: projectId}).patchOne({
            gitDeployKey: deployKey
        });

        return deployKey;
    }

    @Action()
    @Role(RoleType.regular)
    async projectTestGitAccess(projectId: string, gitUrl: string): Promise<boolean> {
        await this.permission.checkProjectAdminAccess(projectId);
        return await this.projectManager.projectTestGitAccess(projectId, gitUrl);
    }
}
