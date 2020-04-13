import time

total = 50;
print("{deepkit: iteration, total: %d}" % (total,))

for i in range(1, total):
    print("Step %d..." % (i,))
    print("{deepkit: iteration, step: %d}" % (i,))
    time.sleep(1)
