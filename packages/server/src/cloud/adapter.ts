import {ClusterAdapter, ClusterNode} from "@deepkit/core";
import {ClassType} from "@marcj/estdlib";
import {Injectable, Injector} from "injection-js";

export interface CloudAdapter {
    /**
     * Ensures that the node is removed in the cloud. Should not throw error when already deleted.
     */
    remove(node: ClusterNode): Promise<void>;

    /**
     * Ensures that the node is created and started in the cloud. Should not throw error when already created or started.
     */
    createAndStart(node: ClusterNode): Promise<void>;

    getPublicIp(node: ClusterNode): Promise<string>;
}

@Injectable()
export class CloudAdapterRegistry {
    protected map: { [adapter: string]: ClassType<CloudAdapter> } = {};

    constructor(private injector: Injector) {
    }

    public add(adapter: string, classType: ClassType<CloudAdapter>) {
        this.map[adapter] = classType;
    }

    public has(adapter: string): boolean {
        return this.map[adapter] !== undefined;
    }

    public get(adapter: string): CloudAdapter {
        if (!this.map[adapter]) {
            throw new Error(`No adapter found for cluster mode ${adapter}`);
        }

        return this.injector.get(this.map[adapter]) as CloudAdapter;
    }
}
