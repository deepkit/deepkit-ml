/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {exec} from 'child_process';
import parser from 'fast-xml-parser';
import {readFile} from "fs-extra";
import {isArray} from "@marcj/estdlib";

export interface GpuInformation {
    name: string;

    brand: string;

    uuid: string;

    clock: number;

    /**
     * Value in MHz.
     */
    clockMax: number;

    gpuUtilization: number;

    /**
     * Value in GB
     */
    memoryTotal: number;

    /**
     * Value in GB
     */
    memoryUsed: number;

    powerDraw: number;
    powerLimit: number;

    temperature: number;
    temperatureMax: number;
}

export class GPUReader {
    protected testXml?: string;
    protected parsedData?: any;

    public async readXmlFromFile(path: string) {
        this.testXml = (await readFile(path)).toString('utf8');
    }

    public async readNvidiaSmiXml(): Promise<string> {
        if (this.testXml) {
            return this.testXml;
        }

        return new Promise((resolve, reject) => {
            exec('nvidia-smi -q -x', function (err, stdout) {
                if (err) {
                    return resolve('');
                }

                resolve(stdout);
            });
        });
    }

    public clear() {
        this.parsedData = undefined;
    }

    public async update() {
        this.parsedData = undefined;
        await this.getNvidiaSmiData();
    }

    public async activatePersistentMode(): Promise<void> {
        return new Promise((resolve) => {
            exec('nvidia-persistenced', (err) => {
                resolve();
            });
        });
    }
    public async getVersions(): Promise<{driverVersion: string, cudaVersion: string} | undefined> {
        const data = await this.getNvidiaSmiData();
        if (!data) {
            return;
        }

        return {
            driverVersion: data.nvidia_smi_log.driver_version as string,
            cudaVersion: data.nvidia_smi_log.cuda_version as string,
        };
    }

    public async getNvidiaSmiData(): Promise<any | false> {
        if (!this.parsedData) {
            const xml = await this.readNvidiaSmiXml();
            if (xml) {
                const obj = parser.getTraversalObj(xml, {});
                this.parsedData = parser.convertToJson(obj, {});
            } else {
                this.parsedData = false;
            }
        }

        return this.parsedData;
    }

    public async getGpuUUIDsForIndex(indexes: number[]): Promise<string[]> {
        const gpus = await this.getGpus();
        const result: string[] = [];
        for (const index of indexes) {
            if (gpus[index]) {
                result.push(gpus[index].uuid);
            }
        }

        return result;
    }

    public async getGpus(uuids?: string[]): Promise<GpuInformation[]> {
        const gpus: GpuInformation[] = [];

        for (const gpu of await this.getFullGpus()) {
            gpus.push({
                name: gpu.product_name,
                brand: gpu.product_brand,
                uuid: gpu.uuid,
                clock: parseFloat(gpu.clocks.graphics_clock) || -1,
                clockMax: parseFloat(gpu.max_clocks.graphics_clock) || -1,
                gpuUtilization: parseFloat(gpu.utilization.gpu_util) / 100,
                memoryTotal: parseFloat(gpu.fb_memory_usage.total) / 1024,
                memoryUsed: parseFloat(gpu.fb_memory_usage.used) / 1024,
                powerDraw: parseFloat(gpu.power_readings.power_draw) || -1,
                powerLimit: parseFloat(gpu.power_readings.max_power_limit) || -1,
                temperature: parseFloat(gpu.temperature.gpu_temp) || -1,
                temperatureMax: parseFloat(gpu.temperature.gpu_temp_max_threshold) || -1,
            });
        }

        if (uuids && uuids.length) {
            const sorted: GpuInformation[] = [];

            for (const uuid of uuids) {
                for (const gpu of gpus) {
                    if (gpu.uuid === uuid) {
                        sorted.push(gpu);
                        break;
                    }
                }
            }

            return sorted;
        }

        return gpus;
    }

    public async getFullGpus(): Promise<any[]> {
        const data = await this.getNvidiaSmiData();

        if (!data) {
            return [];
        }

        if (isArray(data.nvidia_smi_log.gpu)) {
            return data.nvidia_smi_log.gpu;
        }

        if (data.nvidia_smi_log.gpu) {
            return [data.nvidia_smi_log.gpu];
        }

        return [];
    }
}
