import 'reflect-metadata';
import 'jest-extended';
import {each, eachPair, first, firstKey, size} from '@marcj/estdlib';
import {getEntitySchema, plainToClass} from "@marcj/marshal";
import {findNodesForQueueItem, FitsStatus, requirementFits} from '../src/resources';
import {ClusterNode, NodeGpuResource, NodeResources} from '../src/model/clusterNode';
import {Cluster, JobAssignedResources, JobResources} from "..";

test('test resources free', () => {
    const nodeFree = new ClusterNode('1', 'node1');
    nodeFree.resources.cpu.total = 4;
    nodeFree.resources.cpu.reserved = 0;
    nodeFree.resources.memory.total = 4;
    nodeFree.resources.memory.reserved = 0;

    expect(requirementFits(nodeFree.resources, JobResources.fromPartial({cpu: 2, memory: 1, gpu: 0, minGpuMemory: 0}))).toEqual(FitsStatus.fits);
    expect(requirementFits(nodeFree.resources, JobResources.fromPartial({cpu: 0, memory: 1, gpu: 0, minGpuMemory: 0}))).toEqual(FitsStatus.fits);
    expect(requirementFits(nodeFree.resources, JobResources.fromPartial({cpu: 0, memory: 0, gpu: 0, minGpuMemory: 0}))).toEqual(FitsStatus.fits);

    expect(requirementFits(nodeFree.resources, JobResources.fromPartial({minCpu: 2, minMemory: 1, gpu: 0, minGpuMemory: 0}))).toEqual(FitsStatus.fits);
    expect(requirementFits(nodeFree.resources, JobResources.fromPartial({minCpu: 0, minMemory: 1, gpu: 0, minGpuMemory: 0}))).toEqual(FitsStatus.fits);
    expect(requirementFits(nodeFree.resources, JobResources.fromPartial({minCpu: 0, minMemory: 0, gpu: 0, minGpuMemory: 0}))).toEqual(FitsStatus.fits);

    expect(requirementFits(nodeFree.resources, JobResources.fromPartial({
        cpu: 0,
        memory: 0,
        gpu: 1,
        minGpuMemory: 0
    }))).toEqual(FitsStatus.neverFits);
    expect(requirementFits(nodeFree.resources, JobResources.fromPartial({
        cpu: 2,
        memory: 5,
        gpu: 0,
        minGpuMemory: 0
    }))).toEqual(FitsStatus.neverFits);
    expect(requirementFits(nodeFree.resources, JobResources.fromPartial({
        cpu: 5,
        memory: 1,
        gpu: 0,
        minGpuMemory: 0
    }))).toEqual(FitsStatus.neverFits);
});

test('schema', () => {
    const s = getEntitySchema(ClusterNode);
    expect(s.propertyNames.length).toBeGreaterThan(0);
});

const localCluster = new Cluster('localCluster');
const googleCluster = new Cluster('GoogleCluster');

const node1 = plainToClass(ClusterNode, {
    id: 'node1',
    name: 'node1',
    cluster: localCluster.id,
    resources: {
        cpu: {total: 4, reserved: 3},
        memory: {total: 4, reserved: 1},
    }
});

const nodeBig = plainToClass(ClusterNode, {
    id: 'nodeBig',
    name: 'nodeBig',
    cluster: localCluster.id,
    resources: {
        cpu: {total: 32, reserved: 0},
        memory: {total: 64, reserved: 0},
    }
});

const nodeBusy = plainToClass(ClusterNode, {
    id: 'busy',
    name: 'busy',
    cluster: localCluster.id,
    resources: {
        cpu: {total: 8, reserved: 8},
        memory: {total: 8, reserved: 8},
    }
});

const nodeGpu = plainToClass(ClusterNode, {
    id: 'gpu',
    name: 'gpu',
    cluster: googleCluster.id,
    resources: {
        cpu: {total: 4, reserved: 0},
        memory: {total: 4, reserved: 0},
        gpu: [
            {id: 1, name: 'TitanX', memory: 4, reserved: false},
            {id: 2, name: 'TitanX 2', memory: 6, reserved: false}
        ]
    }
});

const busyGpu = plainToClass(ClusterNode, {
    id: 'busyGpu',
    name: 'busyGpu',
    cluster: googleCluster.id,
    resources: {
        cpu: {total: 4, reserved: 0},
        memory: {total: 4, reserved: 0},
        gpu: [
            {id: 1, name: 'TitanX 3', memory: 4, reserved: true},
            {id: 2, name: 'TitanX 4', memory: 16, reserved: false}
        ]
    }
});

test('test models', () => {
    expect(node1.resources.cpu.total).toEqual(4);
    expect(node1.resources.cpu.reserved).toEqual(3);
    expect(node1.resources.memory.total).toEqual(4);
    expect(node1.resources.memory.reserved).toEqual(1);
});


function consume(given: {cpu: [number, number], memory: [number, number], gpus?: ([boolean, number])[]}, consume: Partial<JobResources>) {
    const resources = new NodeResources;
    resources.cpu.reserved = given.cpu[0];
    resources.cpu.total = given.cpu[1];

    resources.memory.reserved = given.memory[0];
    resources.memory.total = given.memory[1];

    let id = 0;
    for (const [reserved, gpuMemory] of given.gpus || []) {
        const gpu = new NodeGpuResource(String(id), 'name-' + id);
        gpu.reserved = reserved;
        gpu.memory = gpuMemory;
        resources.gpu.push(gpu);
        id++;
    }

    const assignedResources = resources.consume(JobResources.fromPartial(consume));

    return {cpu: assignedResources.cpu, memory: assignedResources.memory, gpus: assignedResources.getGpuUUIDs()};
}

test('test consume', () => {
    expect(consume({cpu: [0, 4], memory: [0, 4]}, {cpu: 1, memory: 1})).toEqual({cpu: 1, memory: 1, gpus: []});
    expect(consume({cpu: [0, 4], memory: [0, 4]}, {cpu: 1})).toEqual({cpu: 1, memory: 4, gpus: []});


    expect(consume({cpu: [0, 4], memory: [0, 4]}, {cpu: 1, maxCpu: 2})).toEqual({cpu: 1, memory: 4, gpus: []});
    expect(consume({cpu: [0, 4], memory: [0, 4]}, {minCpu: 1, maxCpu: 2})).toEqual({cpu: 2, memory: 4, gpus: []});
    expect(consume({cpu: [0, 4], memory: [0, 4]}, {minCpu: 1, maxCpu: 5})).toEqual({cpu: 4, memory: 4, gpus: []});


    expect(consume({cpu: [0, 4], memory: [0, 4]}, {memory: 1, maxMemory: 2})).toEqual({cpu: 4, memory: 1, gpus: []});
    expect(consume({cpu: [0, 4], memory: [0, 4]}, {minMemory: 1, maxMemory: 2})).toEqual({cpu: 4, memory: 2, gpus: []});
    expect(consume({cpu: [0, 4], memory: [0, 4]}, {minMemory: 1, maxMemory: 5})).toEqual({cpu: 4, memory: 4, gpus: []});


    expect(() => consume({cpu: [0, 4], memory: [0, 4]}, {cpu: 5})).toThrow();
    expect(() => consume({cpu: [0, 4], memory: [0, 4]}, {memory: 5})).toThrow();
    expect(() => consume({cpu: [0, 4], memory: [0, 4]}, {gpu: 1})).toThrow();

    expect(() => consume({cpu: [0, 4], memory: [0, 4]}, {minCpu: 5})).toThrow();
    expect(() => consume({cpu: [0, 4], memory: [0, 4]}, {minMemory: 5})).toThrow();
    expect(() => consume({cpu: [0, 4], memory: [0, 4]}, {minGpu: 1})).toThrow();


    expect(consume({cpu: [0, 4], memory: [0, 4], gpus: [[false, 4]]}, {cpu: 1, memory: 1, gpu: 1, minGpuMemory: 4})).toEqual({cpu: 1, memory: 1, gpus: ['0']});
    expect(consume({cpu: [0, 4], memory: [0, 4], gpus: [[false, 4]]}, {cpu: 1, memory: 1, gpu: 1})).toEqual({cpu: 1, memory: 1, gpus: ['0']});

    expect(consume({cpu: [0, 4], memory: [0, 4], gpus: [[false, 4], [true, 6], [false, 6]]}, {cpu: 1, memory: 1, gpu: 2})).toEqual({cpu: 1, memory: 1, gpus: ['0', '2']});
    expect(consume({cpu: [0, 4], memory: [0, 4], gpus: [[false, 4], [true, 6], [false, 6]]}, {cpu: 1, memory: 1, minGpu: 1})).toEqual({cpu: 1, memory: 1, gpus: ['0', '2']});
    expect(
        consume({cpu: [0, 4], memory: [0, 4], gpus: [[false, 4], [true, 6], [false, 6]]}, {cpu: 1, memory: 1, minGpu: 1, minGpuMemory: 6})).toEqual({cpu: 1, memory: 1, gpus: ['2']}
    );
});

/*

resources:
    # defaults
    allCpu: true
    allMemory: true
    allGpu: true

    minCpu: 1
    maxCpu: 1
    # eq to
    cpu: 1
 */
test('test resources reserved', () => {
    expect(requirementFits(node1.resources, JobResources.fromPartial({cpu: 1, memory: 1, gpu: 0, minGpuMemory: 0}))).toEqual(FitsStatus.fits);
    expect(requirementFits(node1.resources, JobResources.fromPartial({cpu: 0, memory: 3, gpu: 0, minGpuMemory: 0}))).toEqual(FitsStatus.fits);
    expect(requirementFits(node1.resources, JobResources.fromPartial({cpu: 0, memory: 0, gpu: 0, minGpuMemory: 0}))).toEqual(FitsStatus.fits);
    expect(requirementFits(node1.resources, JobResources.fromPartial({cpu: 0, memory: 0, gpu: 0, minGpuMemory: 4}))).toEqual(FitsStatus.fits);

    expect(requirementFits(node1.resources, JobResources.fromPartial({cpu: 2, memory: 1, gpu: 0, minGpuMemory: 0}))).toEqual(FitsStatus.notFree);
    expect(requirementFits(node1.resources, JobResources.fromPartial({cpu: 0, memory: 4, gpu: 0, minGpuMemory: 0}))).toEqual(FitsStatus.notFree);
    expect(requirementFits(node1.resources, JobResources.fromPartial({cpu: 4, memory: 4, gpu: 0, minGpuMemory: 0}))).toEqual(FitsStatus.notFree);

    expect(requirementFits(node1.resources, JobResources.fromPartial({cpu: 2, memory: 5, gpu: 0, minGpuMemory: 0}))).toEqual(FitsStatus.neverFits);
    expect(requirementFits(node1.resources, JobResources.fromPartial({cpu: 5, memory: 1, gpu: 0, minGpuMemory: 0}))).toEqual(FitsStatus.neverFits);
    expect(requirementFits(node1.resources, JobResources.fromPartial({cpu: 1, memory: 1, gpu: 1, minGpuMemory: 0}))).toEqual(FitsStatus.neverFits);

    expect(requirementFits(nodeGpu.resources, JobResources.fromPartial({
        cpu: 1,
        memory: 1,
        gpu: 1,
        minGpuMemory: 8
    }))).toEqual(FitsStatus.neverFits);
    expect(requirementFits(nodeGpu.resources, JobResources.fromPartial({cpu: 1, memory: 1, gpu: 1, minGpuMemory: 0}))).toEqual(FitsStatus.fits);
    expect(requirementFits(nodeGpu.resources, JobResources.fromPartial({cpu: 1, memory: 1, gpu: 1, minGpuMemory: 4}))).toEqual(FitsStatus.fits);
    expect(requirementFits(nodeGpu.resources, JobResources.fromPartial({cpu: 1, memory: 1, gpu: 1, minGpuMemory: 6}))).toEqual(FitsStatus.fits);
    expect(requirementFits(nodeGpu.resources, JobResources.fromPartial({cpu: 1, memory: 1, gpu: 2, minGpuMemory: 4}))).toEqual(FitsStatus.fits);
    expect(requirementFits(nodeGpu.resources, JobResources.fromPartial({cpu: 1, memory: 1, gpu: 2, minGpuMemory: 6}))).toEqual(FitsStatus.neverFits);
    expect(requirementFits(nodeGpu.resources, JobResources.fromPartial({cpu: 1, memory: 1, gpu: 1, minGpuMemory: 8}))).toEqual(FitsStatus.neverFits);
});

function expectAssignment(jobResources: Partial<JobResources>, node: ClusterNode, availableNodes?: ClusterNode[]): JobAssignedResources | FitsStatus {
    availableNodes = availableNodes || [node1, nodeBig, nodeBusy, nodeGpu, busyGpu];
    const nodeName = node.id;

    const resources = plainToClass(JobResources, jobResources);
    const result = findNodesForQueueItem(availableNodes, 1, resources);
    if (result.status !== FitsStatus.fits) {
        return result.status;
    }

    const nodeAssignments = result.nodeAssignment;

    if (!nodeAssignments[nodeName]) {
        throw new Error(`Wrong assignment, expect=${node.id}, got=${firstKey(nodeAssignments)}`);
    }

    expect(nodeAssignments[nodeName]).not.toBeUndefined();
    expect(size(nodeAssignments[nodeName])).toEqual(1);

    const firstFoundNode: JobAssignedResources = first(nodeAssignments[nodeName])!;

    expect(firstFoundNode.cpu).toBeGreaterThanOrEqual(resources.cpu);
    expect(firstFoundNode.cpu).toBeGreaterThanOrEqual(resources.minCpu);
    expect(firstFoundNode.memory).toBeGreaterThanOrEqual(resources.memory);
    expect(firstFoundNode.memory).toBeGreaterThanOrEqual(resources.minMemory);

    expect(firstFoundNode.gpus.length).toEqual(resources.gpu);
    if (resources.gpu) {
        if (firstFoundNode.getMinGpuMemory() < resources.minGpuMemory) {
            throw new Error(`Requested gpu memory ${resources.minGpuMemory} but got minimum ${firstFoundNode.getMinGpuMemory()}`);
        }
    }

    return firstFoundNode;
}

function expectAssignments(
    jobResources: Partial<JobResources>,
    nodes: { [nodeId: string]: number },
    replicas: number,
    availableNodes?: ClusterNode[],
): JobAssignedResources[] | FitsStatus {
    availableNodes = availableNodes || [node1, nodeBig, nodeBusy, nodeGpu, busyGpu];

    const resources = plainToClass(JobResources, jobResources);
    const result = findNodesForQueueItem(availableNodes, replicas, resources);
    if (result.status !== FitsStatus.fits) {
        return result.status;
    }
    const nodeAssignments = result.nodeAssignment;

    const jobAssignedResources: JobAssignedResources[] = [];
    for (const [nodeId, assignments] of eachPair(nodes)) {
        if (!nodeAssignments[nodeId]) {
            throw new Error(`Wrong assignment, expect=${nodeId}, got=${Object.keys(nodeAssignments).join(', ')}`);
        }

        expect(nodeAssignments[nodeId]).not.toBeUndefined();
        if (size(nodeAssignments[nodeId]) !== assignments) {
            throw new Error(`Wrong assignment, expected ${nodeId} to have ${assignments} replicas, but got=${JSON.stringify(nodeAssignments)}`);
        }


        for (const assignment of each(nodeAssignments[nodeId])) {
            jobAssignedResources.push(assignment);

            expect(assignment.cpu).toBeGreaterThanOrEqual(resources.cpu);
            expect(assignment.memory).toBeGreaterThanOrEqual(resources.memory);

            expect(assignment.gpus.length).toEqual(resources.gpu);
            if (resources.gpu) {
                expect(assignment.getMinGpuMemory()).toBeGreaterThanOrEqual(resources.minGpuMemory);
            }
        }
    }

    return jobAssignedResources;
}


test('test find nodes: single', () => {
    expect(expectAssignment({cpu: 1}, node1)).toBeInstanceOf(JobAssignedResources);
    expect(expectAssignment({cpu: 1, memory: 1}, node1)).toBeInstanceOf(JobAssignedResources);
    expect(expectAssignment({cpu: 1, memory: 3}, node1)).toBeInstanceOf(JobAssignedResources);
    expect(expectAssignment({cpu: 1, memory: 5}, nodeBig)).toBeInstanceOf(JobAssignedResources);
    expect(expectAssignment({cpu: 2, memory: 4}, nodeBig)).toBeInstanceOf(JobAssignedResources);
    expect(expectAssignment({cpu: 4}, nodeBig)).toBeInstanceOf(JobAssignedResources);

    expect(expectAssignment({cpu: 1}, node1, [node1])).toBeInstanceOf(JobAssignedResources);
    expect(expectAssignment({cpu: 2}, node1, [node1])).toBe(FitsStatus.notFree);
});

test('test find nodes: multiple replicas', () => {
    expect(expectAssignments({cpu: 1, memory: 1}, {[node1.id]: 1}, 1)).toBeArrayOfSize(1);
    expect(expectAssignments({cpu: 1, memory: 1}, {[node1.id]: 1, [nodeBig.id]: 1}, 2)).toBeArrayOfSize(2);
    expect(expectAssignments({cpu: 8, memory: 1}, {[nodeBig.id]: 2}, 2)).toBeArrayOfSize(2);
    expect(expectAssignments({cpu: 8, memory: 1}, {[nodeBig.id]: 4}, 4)).toBeArrayOfSize(4);
    expect(expectAssignments({cpu: 8, memory: 1}, {[nodeBig.id]: 8}, 8)).toBe(FitsStatus.neverFits);

    expect(expectAssignments({cpu: 2, memory: 1}, {}, 1, [node1])).toBe(FitsStatus.notFree);
    expect(expectAssignments({cpu: 2, memory: 1}, {}, 2, [node1])).toBe(FitsStatus.notFree);
    expect(expectAssignments({cpu: 4, memory: 1}, {}, 1, [node1])).toBe(FitsStatus.notFree);
    expect(expectAssignments({cpu: 4, memory: 1}, {}, 2, [node1])).toBe(FitsStatus.neverFits);
    expect(expectAssignments({cpu: 1, memory: 1}, {}, 4, [node1])).toBe(FitsStatus.notFree);
    expect(expectAssignments({cpu: 1, memory: 1}, {}, 5, [node1])).toBe(FitsStatus.neverFits);
});

test('test find nodes: impossible', () => {
    expect(expectAssignment({cpu: 64}, node1)).toBe(FitsStatus.neverFits);
});

test('test find nodes: gpu stuff', () => {
    expectAssignment({cpu: 1, gpu: 1}, nodeGpu);
    expectAssignment({cpu: 1, gpu: 2}, nodeGpu);
    expect((expectAssignment({cpu: 1, gpu: 1, minGpuMemory: 4}, nodeGpu) as JobAssignedResources).gpus[0].name).toEqual('TitanX');
    expect((expectAssignment({cpu: 1, gpu: 1, minGpuMemory: 6}, nodeGpu) as JobAssignedResources).gpus[0].name).toEqual('TitanX 2');
    expect((expectAssignment({cpu: 1, gpu: 1, minGpuMemory: 16}, busyGpu) as JobAssignedResources).gpus[0].name).toEqual('TitanX 4');

    {
        const assignment = expectAssignment({cpu: 1, gpu: 2, minGpuMemory: 4}, nodeGpu);
        if (assignment instanceof JobAssignedResources) {
            expect(assignment.gpus[0].name).toEqual('TitanX');
            expect(assignment.gpus[1].name).toEqual('TitanX 2');
        }
    }

    expect(expectAssignment({cpu: 1, gpu: 2, minGpuMemory: 6}, nodeGpu)).toBe(FitsStatus.neverFits);

    {
        const assignments = expectAssignments({cpu: 1, gpu: 1, minGpuMemory: 6}, {[nodeGpu.id]: 1, [busyGpu.id]: 1}, 2);
        if (assignments instanceof Array) {
            expect(assignments[0].gpus[0].name).toEqual('TitanX 2');
            expect(assignments[1].gpus[0].name).toEqual('TitanX 4');
        } else {
            throw new Error('should be array');
        }
    }

    expect(expectAssignment({cpu: 1, gpu: 3}, nodeGpu)).toBe(FitsStatus.neverFits);
    expect(expectAssignment({cpu: 1, gpu: 1, minGpuMemory: 32}, busyGpu)).toBe(FitsStatus.neverFits);

    expect(expectAssignments({cpu: 1, gpu: 1, minGpuMemory: 16}, {}, 2)).toBe(FitsStatus.neverFits);
});
