
let lastPromise;

async function doIt(id) {
    while (lastPromise) {
        await lastPromise;
    }

    const wait = 1;
    console.log('doIt', id, 'DOING', wait, 'ms');

    lastPromise = new Promise((resolve, reject) => {
        setTimeout(() => {
            console.log('doIt', id, 'DONE');
            lastPromise = null;
            resolve();
        }, wait)
    });
}

//for bluebird v2 use stackSize=131068;
let stackSize = 65533;
for (let i = 0; i < stackSize; i++) {
    doIt(i);
}

console.log('waiting now');
