import os
import time
import pgserver

pgdata = r"C:\Users\krish\AppData\Local\Temp\opencode\pgbench"
os.makedirs(pgdata, exist_ok=True)
srv = pgserver.get_server(pgdata)
uri = srv.get_uri()
with open(os.path.join(pgdata, "bench_uri.txt"), "w") as f:
    f.write(uri + "\n")
print("holding:", uri, flush=True)
while True:
    time.sleep(60)
