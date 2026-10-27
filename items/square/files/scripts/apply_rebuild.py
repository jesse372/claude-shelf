#!/usr/bin/env python3
"""Apply a luxe-rebuild plan. DRY RUN unless --confirm. Never called with --confirm by an agent."""
import json,sys,os,time,subprocess,urllib.request,uuid

API="https://connect.squareup.com/v2"; SV="2024-10-17"
def tok():
    return subprocess.check_output(["security","find-generic-password","-s","square","-a","token","-w"],text=True).strip()
def call(method,path,body=None,t=None):
    req=urllib.request.Request(API+path,method=method,
        data=json.dumps(body).encode() if body else None,
        headers={"Authorization":"Bearer "+t,"Square-Version":SV,"Content-Type":"application/json"})
    with urllib.request.urlopen(req) as r: return json.load(r)

def main():
    plan_path=sys.argv[1]; confirm="--confirm" in sys.argv
    phase=next((a.split("=")[1] for a in sys.argv if a.startswith("--phase=")),"all")
    p=json.load(open(plan_path))
    p.setdefault("applied_phases",{})
    if p["applied_phases"].get(phase):
        print("REFUSING: phase '%s' already applied at %s. Re-plan instead."%(phase,p["applied_phases"][phase])); sys.exit(3)
    t=tok(); LOC="Q0QM7TJZ6949G"
    print("MODE:","WRITE" if confirm else "DRY RUN (nothing will be sent)")

    # ---- drift check on archive targets
    live=call("GET","/catalog/list?types=ITEM",t=t)
    byid={o["id"]:o for o in live.get("objects",[])}
    drift=[]
    for a in p["archive"]:
        o=byid.get(a["item_id"])
        if not o: drift.append((a["item_name"],"gone from catalogue"))
        elif o.get("version")!=a["version"]: drift.append((a["item_name"],"version changed"))
    if drift and phase in ("all","archive") and "--force" not in sys.argv:
        print("REFUSING — catalogue changed since plan was built:")
        for n,w in drift: print("   %s: %s"%(n,w))
        sys.exit(4)

    batches=[]
    if phase in ("all","create"):
     for c in p["create"]:
        iid="#item_%s"%uuid.uuid4().hex[:8]; vid="#var_%s"%uuid.uuid4().hex[:8]
        batches.append({"type":"ITEM","id":iid,"present_at_all_locations":False,
          "present_at_location_ids":[LOC],
          "item_data":{"name":c["name"],"description":c["description"],
            "product_type":"APPOINTMENTS_SERVICE","category_name":c["category"],
            "variations":[{"type":"ITEM_VARIATION","id":vid,"present_at_all_locations":False,
              "present_at_location_ids":[LOC],
              "item_variation_data":{"item_id":iid,"name":"Regular","pricing_type":"FIXED_PRICING",
                "price_money":{"amount":c["price_cents"],"currency":"AUD"},
                "service_duration":c["duration_min"]*60000,"available_for_booking":True}}]}})
    if phase in ("all","archive"):
     for a in p["archive"]:
        o=byid[a["item_id"]]; d=dict(o["item_data"]); d["is_archived"]=True
        batches.append({"type":"ITEM","id":o["id"],"version":o["version"],
          "present_at_all_locations":False,"present_at_location_ids":[LOC],"item_data":d})

    print("phase=%s -> %d objects (%s)"%(phase,len(batches),"creates only" if phase=="create" else phase))
    if not confirm:
        print("\nDRY RUN COMPLETE — no request sent. Re-run with --confirm to write."); sys.exit(2)

    res=call("POST","/catalog/batch-upsert",
        {"idempotency_key":p["plan_id"]+"-"+phase,"batches":[{"objects":batches}]},t=t)
    n=len(res.get("objects",[]))
    p["applied_phases"][phase]=time.strftime("%Y-%m-%dT%H:%M:%S"); json.dump(p,open(plan_path,"w"),indent=2)
    log=os.path.expanduser("~/.claude/logs/square-writes.log")
    with open(log,"a") as f:
        f.write("%s plan=%s created=%d archived=%d objects=%d\n"%(
            time.strftime("%FT%T"),p["plan_id"],len(p["create"]),len(p["archive"]),n))
    print("APPLIED: %d objects written. Logged to %s"%(n,log))
main()
