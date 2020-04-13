# DeepKit Server


tsconfig.run.json vs tsconfig.json. `tsconfig.json` is for webStorm so it resolves all paths correctly. This won't work for
 ts-node as we need transitive instances of dependencies to work, so we use `tsconfig.run.json` there, to make sure
 @deepkit/core etc is loaded from node_modules correctly.

## FS Layer

We do not use MongoDB to store file content due its lack of streamed files and atomic file updates.
Instead, we use the local file system and an own abstraction to not have duplicated files everywhere.
However, we still store in MongoDB all meta information about files:

### collection "files"

```
interface file {
    id: UUID();
    path: string;
    mode: 'closed' | 'streaming';
    md5: string | null; //null in case of file is in mode=streaming
    size: number;
    contentType: string;
    created: Date;
    updated: Date;
    contentSynced: {
        //when a sync happens we set this to false, until the whole file CONTENT is streamed as well
        done: boolean;
        //indicating how much we already synced from remote
        downloaded: number;
    }; 
    metadata: {[name: string]: any};
}
```

```
./data/files/closed/<md5>
./data/files/streaming/<id>
```

Note: `<md5>` and `<id>` splitted to not have potentially extremely high number of files in a single directory.  


## PubSub channels


### <accountId>/

Account stuff. Added/updated entities: project, job, node

publishAccount() used in server/app.controller.ts. subscribeAccount() used in electron app.

### <accountId>/job/<jobId>

Job related stuff for one running job. Stats, metrics, logs, ...

publishJob() used in server/job.controller.ts. subscribeJob() used in electron app.

### ExchangeController

```
//register for controller
SocketService.exchange.actionRegisterController(<accountId>/<context>/<id>, controller);

//communicate with controller
SocketService.exchange.action(<accountId>/<context>/<id>, <action>, <args...>);
// or
RemoteClient.exchangeAction(channelName, action, args);
```



## MongoDB collections

### jobs

All jobs.

### projects

All checked out projects.

### tokens

Tokens used by external clients. On-Premises/Cloud only.

### accounts

All user and organistations accounts. On-Premises/Cloud only.
Locally the ~/.deepkit/config:accounts is used. 

### accountMembers

Pivot table for accounts memberships. On-Premises/Cloud only.
