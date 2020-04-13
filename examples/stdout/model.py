import random
import time
import sys

epochs=int(sys.argv[1])
samples=int(sys.argv[2])

print("{deepkit: epoch, total: %d}" %(epochs,))
print("{deepkit: create-channel, name: accuracy, kpi: True, main: True, traces: [validation, training]}")
print("{deepkit: create-channel, name: text, type: text, main: True}")
print("{deepkit: status, status: Training}")
print("{deepkit: info, name: test, value: geilo}")

for i in range(0, epochs):
    print("{deepkit: epoch, epoch: %d}" %(i+1,))
    print("hi" + str(i+1))
    print("{deepkit: loss, x: %d, training: %f, validation: %f}" %(i+1, random.randint(-10, 20), 35 + random.randint(-10, 20)))
    print("{deepkit: channel, name: accuracy, x: %d, y: [%f, %f]}" %(i+1, random.randint(-25, 25), random.randint(-11, 15)))
    print("{deepkit: channel, name: text, x: %d, y: %s}" %(i+1, "hiiii "+str(i+1)))
    for j in range(0, samples):
        print("{deepkit: sample, sample: %d, total: %d}" %(j+1, samples))
        time.sleep(0.03)

