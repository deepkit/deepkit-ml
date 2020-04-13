/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

export interface ContainerInfo {
    Id: string;
    Names: string[];
    Image: string;
    ImageID: string;
    Command: string;
    Created: number;
    Ports: Port[];
    Labels: { [label: string]: string };
    State: string;
    Status: string;
    HostConfig: {
        NetworkMode: string;
    };
    NetworkSettings: {
        Networks: { [networkType: string]: NetworkInfo }
    };
}

export interface Port {
    IP: string;
    PrivatePort: number;
    PublicPort: number;
    Type: string;
}

export interface NetworkInfo {
    IPAMConfig?: any;
    Links?: any;
    Aliases?: any;
    NetworkID: string;
    EndpointID: string;
    Gateway: string;
    IPAddress: string;
    IPPrefixLen: number;
    IPv6Gateway: string;
    GlobalIPv6Address: string;
    GlobalIPv6PrefixLen: number;
    MacAddress: string;
}

export interface ImageInfo {
    Id: string;
    ParentId: string;
    RepoTags: string[];
    RepoDigests?: string[];
    Created: number;
    Size: number;
    VirtualSize: number;
    Labels: { [label: string]: string };
}

export interface NodePeerControllerInterface {
    loadJobsToStart(): Promise<void>;

    stop(): Promise<void>;

    loadStartConfig(): Promise<void>;

    checkDocker(): Promise<boolean>;

    checkNvidia(): Promise<void>;

    getDockerContainer(): Promise<ContainerInfo[]>;

    removeDockerImage(imageId: string): Promise<void>;

    pruneDockerImages(): Promise<void>;

    pruneDockerContainer(): Promise<void>;

    getDockerImages(): Promise<ImageInfo[]>;
}
