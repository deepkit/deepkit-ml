import 'jest-extended';
import {Provision, SshConnection} from "../src/provision";
import {Docker} from "../src/docker";
import {onProcessExit} from "../src/process";

jest.setTimeout(5000000);

test('test docker', async () => {
    const docker = new Docker;
    try {
        await docker.info();
    } catch (error) {
        console.warn("Not supported on this platform: Docker not installed");
        return;
    }

    const port = 22555;
    const container = await docker.createContainer({
        Image: 'rastasheep/ubuntu-sshd',
        ExposedPorts: {'22/tcp': {} },
        HostConfig: {
            AutoRemove: true,
            PortBindings: {'22/tcp': [{ HostPort: String(port) }]}
        }
    });

    console.log('container start');
    await container.start();

    console.log('connect to that shit');
    const connection = new SshConnection('localhost', port, 'root', 'root');
    const provision = new Provision(connection);

    const sub = onProcessExit(async () => {
        await container.remove({force: true, v: true});
    });

    try {
        console.log('lets go');
        await provision.provision();
    } finally {
        console.log('stop that shit');
        await container.remove({force: true, v: true});
        sub.unsubscribe();
    }
});
