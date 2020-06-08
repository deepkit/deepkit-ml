/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import 'reflect-metadata';
import {Command, flags} from '@oclif/command';
import {execSync} from "child_process";

export class InstallNvidiaCommand extends Command {
    static description = 'server: Installs nvidia using binary from nvidia directly';

    public static flags = {
        disableNouveau: flags.boolean(),
    };

    public async run(): Promise<void> {
        const {flags} = this.parse(InstallNvidiaCommand);

        function exec(command: string, getStdout = false): string {
            console.log('$ ' + command);

            return execSync(command, {
                encoding: 'utf8',
                stdio: getStdout ? undefined : 'inherit'
            });
        }

        const env = 'UCF_FORCE_CONFOLD=1 DEBIAN_FRONTEND=noninteractive';

        const nvidiaDriver = 'http://us.download.nvidia.com/XFree86/Linux-x86_64/430.40/NVIDIA-Linux-x86_64-430.40.run';

        if (flags.disableNouveau) {
            exec(`echo blacklist nouveau > /etc/modprobe.d/blacklist-nvidia-nouveau.conf`);
            exec(`echo options nouveau modeset=0 >> /etc/modprobe.d/blacklist-nvidia-nouveau.conf`);
            exec(`update-initramfs -u`);
            exec(`rmmod nouveau || true`);
            return;
        }

        try {
            exec('nvidia-smi');
        } catch {
            exec('apt-get update');
            exec(env + ' apt-get install -y build-essential dkms linux-headers-$(uname -r|sed \'s/[^-]*-[^-]*-//\')');
            exec(`curl ${nvidiaDriver} -o nvidia-driver.run`);
            exec(`chmod u+x nvidia-driver.run`);
            exec(`./nvidia-driver.run --silent --dkms`);
        }

        const distribution = exec(`sh -c '. /etc/os-release;echo -n $ID$VERSION_ID'`, true);
        console.log(`distribution=${distribution}\n`);
        exec(`curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | apt-key add -`);
        exec(`curl -s -L https://nvidia.github.io/nvidia-docker/${distribution}/nvidia-docker.list | tee /etc/apt/sources.list.d/nvidia-docker.list`);
        exec('apt-get update');
        exec(env + ' apt-get install -y nvidia-container-toolkit');
        exec(`systemctl restart docker || true`);

        console.log('Done');
    }
}
