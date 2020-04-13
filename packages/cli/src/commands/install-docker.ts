/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

import 'reflect-metadata';
import {Command} from '@oclif/command';
import {execSync} from "child_process";
import getos from "getos";

export class InstallDockerCommand extends Command {
    static description = 'server: Installs docker using apt-get';


    public async run(): Promise<void> {
        this.parse(InstallDockerCommand);

        function exec(command: string, getStdout = false): string {
            console.log('$ ' + command);

            return execSync(command, {
                encoding: 'utf8',
                stdio: getStdout ? undefined : 'inherit'
            });
        }

        const os = await new Promise<getos.Os>((resolve, reject) => {
            getos((e: any, os?: getos.Os) => {
                if (e) reject(e);
                if (os) resolve(os);
            });
        });

        const env = 'UCF_FORCE_CONFOLD=1 DEBIAN_FRONTEND=noninteractive';
        if (os.os === 'linux' && os.dist === 'Debian') {
            exec('apt-get update');
            exec(env + ' apt-get install -y apt-transport-https ca-certificates curl gnupg2 software-properties-common');
            exec('curl -fsSL https://download.docker.com/linux/debian/gpg | apt-key add -');
            const lsb_release = exec('lsb_release -cs', true);
            exec(`add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/debian ${lsb_release} stable"`);
            exec('apt-get update');
            exec(env + ' apt-get install -y docker-ce docker-ce-cli containerd.io');
            exec('systemctl restart docker');
        }

        if (os.os === 'linux' && os.dist === 'Ubuntu Linux') {
            exec('apt-get update');
            exec(env + ' apt-get install -y apt-transport-https ca-certificates curl gnupg2 software-properties-common');
            exec('curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add -');
            const lsb_release = exec('lsb_release -cs', true);
            exec(`add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu ${lsb_release} stable"`);
            exec('apt-get update');
            exec(env + ' apt-get install -y docker-ce docker-ce-cli containerd.io');
            exec('systemctl restart docker');
        }
    }
}
