import {CloudAdapter} from "./adapter";
import {ClusterNode, ClusterNodeCredentials, ClusterNodeStatus} from "@deepkit/core";
import fetch, {Headers} from 'node-fetch';
import {ExchangeDatabase} from "@marcj/glut-server";
import {Injectable} from "injection-js";
import {Database} from "@marcj/marshal-mongo";
import {uuid} from "@marcj/marshal";

interface GenesisInstance {
    id: string;
    name: string;
    hostname: string;
    type: string;
    allowed_actions: string[];
    image: { id: string, name: string };
    ssh_keys: { id: string, name: string }[],
    security_groups: { id: string, name: string }[],
    status: string;
    private_ip: string | null;
    public_ip: string | null;
    created_at: string;
    updated_at: string | null;
}

interface GenesisInstanceCreate {
    name: string;
    hostname: string;
    type: string;
    image: string;
    ssh_keys: string[];

    password?: string;
    security_groups?: string[];
    metadata?: {
        startup_script?: string;
    };
}

@Injectable()
export class GenesisApi {
    protected baseUrl = 'https://api.genesiscloud.com/compute';
    protected version = 1;

    protected headers = new Headers({
        'X-Auth-Token': 'jDkEK0yjCgKGBmjxhOHEAJWbRUMFNCcn', //todo make configurable
        'Content-Type': 'application/json',
    });


    protected getUrl(path: string): string {
        return `${this.baseUrl}/v${this.version}/${path}`;
    }

    async getInstance(id: string): Promise<GenesisInstance> {
        if (!id) throw new Error(`No id given`);

        const url = this.getUrl(`instances/${id}`);
        const response = await fetch(url, {
            method: 'get',
            headers: this.headers
        });

        if (response.status !== 200) {
            throw new Error('Error retrieving instance info:' + response.status + ': ' + await response.text());
        }

        return (await response.json()).instance;
    }

    async removeInstance(id: string): Promise<any> {
        const url = this.getUrl(`instances/${id}`);
        await fetch(url, {
            method: 'delete',
            headers: this.headers
        });
    }

    async addInstance(name: string, type: string, password: string): Promise<GenesisInstance> {
        const url = this.getUrl('instances');

        const response = await fetch(url, {
            method: 'post',
            body: JSON.stringify({
                name,
                type,
                hostname: name,
                password: password,
                image: '45d06539-f8f5-48d9-816e-d4b1a8e5163e' //Ubuntu 18.04, todo: make configurable
            } as GenesisInstanceCreate),
            headers: this.headers
        });

        if (response.status !== 201) {
            throw new Error('Could not create instance:' + await response.text());
        }

        return (await response.json()).instance;
    }
}

@Injectable()
export class GenesisAdapter implements CloudAdapter {
    constructor(
        protected api: GenesisApi,
        protected exchangeDatabase: ExchangeDatabase,
        protected database: Database,
    ) {
    }

    async remove(node: ClusterNode): Promise<void> {
        if (!node.instanceId) {
            console.log('GenesisAdapter.remove: No instanceId found. Can not remove.');
            return;
        }

        await this.api.removeInstance(node.instanceId);
    }

    async getPublicIp(node: ClusterNode): Promise<string> {
        if (!node.instanceId) return '';

        const instance = await this.api.getInstance(node.instanceId);
        console.log('instance', node.instanceId, instance);

        return instance.public_ip || '';
    }

    async createAndStart(node: ClusterNode): Promise<void> {
        if (node.instanceId) {
            //todo, check if still exists and make sure it is running.
        }

        await this.database.query(ClusterNodeCredentials).filter({nodeId: node.id}).deleteMany();
        const credentials = new ClusterNodeCredentials(node.id);
        credentials.sshUsername = 'ubuntu';
        credentials.sshPassword = 'M@$' + uuid();
        credentials.sshRequiresSudo = true;
        await this.database.add(credentials);

        const name = `deepkit-${node.name}-${node.id}`;
        const response = await this.api.addInstance(name, node.instanceType, credentials.sshPassword);

        await this.exchangeDatabase.patch(ClusterNode, node.id, {
            instanceId: response.id,
        });

        console.log('genesis added instance', response);
    }
}
