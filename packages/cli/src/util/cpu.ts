/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import {CpuInfo} from 'os';

export class CpuHelper {

    public static calculateUsagePerCore(cpu: CpuInfo, lastCpu?: CpuInfo): number {
        if (!lastCpu) {
            return 0;
        }

        const totalCputime = cpu.times.irq + cpu.times.idle + cpu.times.nice + cpu.times.sys + cpu.times.user;
        const lastTotalCputime = lastCpu.times.irq + lastCpu.times.idle + lastCpu.times.nice + lastCpu.times.sys + lastCpu.times.user;

        const usedCpuTimeSinceLast = totalCputime - lastTotalCputime;
        const idleSinceLast = cpu.times.idle - lastCpu.times.idle;

        return (1 - (idleSinceLast / usedCpuTimeSinceLast)) || 0;
    }

}
