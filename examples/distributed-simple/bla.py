


@task('prepare')
def prepare():
    pass


@task('train', {resources: {gpu: 1}, input: {prepare: 'cifar'})
def train(prepare):
    pass




