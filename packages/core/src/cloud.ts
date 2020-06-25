import {NodeResources} from "./model/clusterNode";
import {ClusterAdapter} from "./model/cluster";

export interface InstanceTypes {
    [name: string]: NodeResources;
}

function createGpus(amount: number, name: string, memory: number): {name: string, memory: number}[] {
    const res: {name: string, memory: number}[] = [];

    for (let i = 0; i < amount; i++) {
        res.push({name, memory});
    }

    return res;
}


export const instanceTypesMap: { [type in ClusterAdapter]?: InstanceTypes } = {
    [ClusterAdapter.genesis_cloud]: {
        'vcpu-4_memory-12g_disk-80g_nvidia1080ti-1': NodeResources.create(4, 12, createGpus(1, 'NVIDIA 1080ti', 12)),
        'vcpu-8_memory-24g_disk-80g_nvidia1080ti-2': NodeResources.create(8, 24, createGpus(2, 'NVIDIA 1080ti', 12)),
        'vcpu-12_memory-36g_disk-80g_nvidia1080ti-3': NodeResources.create(12, 36, createGpus(3, 'NVIDIA 1080ti', 12)),
        'vcpu-16_memory-48g_disk-80g_nvidia1080ti-4': NodeResources.create(16, 48, createGpus(4, 'NVIDIA 1080ti', 12)),
        'vcpu-20_memory-60g_disk-80g_nvidia1080ti-5': NodeResources.create(20, 60, createGpus(5, 'NVIDIA 1080ti', 12)),
        'vcpu-24_memory-72g_disk-80g_nvidia1080ti-6': NodeResources.create(24, 72, createGpus(6, 'NVIDIA 1080ti', 12)),
        'vcpu-28_memory-84g_disk-80g_nvidia1080ti-7': NodeResources.create(28, 84, createGpus(7, 'NVIDIA 1080ti', 12)),
        'vcpu-32_memory-96g_disk-80g_nvidia1080ti-8': NodeResources.create(32, 96, createGpus(8, 'NVIDIA 1080ti', 12)),
        'vcpu-36_memory-108g_disk-80g_nvidia1080ti-9': NodeResources.create(36, 108, createGpus(9, 'NVIDIA 1080ti', 12)),
        'vcpu-40_memory-120g_disk-80g_nvidia1080ti-10': NodeResources.create(40, 120, createGpus(10, 'NVIDIA 1080ti', 12)),
    }
};
