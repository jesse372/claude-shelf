import os, sys, json, tempfile
os.environ["META_ACCESS_TOKEN"]="TESTTOKEN"
os.environ["META_AD_ACCOUNT"]="act_999"
os.environ["META_ADS_STATE"]=tempfile.mkdtemp()
sys.path.insert(0,".")
import metaads as M

CALLS=[]
def fake_api(path, params=None, method="GET", retries=3):
    CALLS.append((method,path,dict(params or {})))
    if path=="/act_999": return {"currency":"AUD","name":"JC Photo","account_status":1}
    if path.startswith("/AD"):  return {"id":path[1:],"name":"Ad A","adset_id":"AS1","campaign_id":"C1"}
    if path.startswith("/AS"):  return {"id":path[1:],"name":"AdSet A","campaign_id":"C1","daily_budget":"5000","status":"ACTIVE"}
    if path.startswith("/C"):   return {"id":path[1:],"name":"Camp A","daily_budget":"10000","status":"ACTIVE"}
    if path.endswith("/copies"):return {"copied_adset_id":"AS_NEW"}
    return {"id":"X"}
M.api=fake_api
M.account_currency=lambda a=None: {"currency":"AUD","name":"JC Photo","account_status":1}

MADE=[]
_orig_new_plan = M.new_plan
def spy_new_plan(*a, **k):
    path, plan = _orig_new_plan(*a, **k)
    MADE.append((path, plan))
    return path, plan
M.new_plan = spy_new_plan

fails=[]
def check(label, cond, extra=""):
    print(("  PASS  " if cond else "  FAIL  ")+label+("" if cond else "   <-- "+str(extra)))
    if not cond: fails.append(label)

print("\n[1] money conversion")
check("50 AUD -> 5000 minor", M.to_minor("50","AUD")==5000, M.to_minor("50","AUD"))
check("49.99 -> 4999",        M.to_minor("49.99","AUD")==4999, M.to_minor("49.99","AUD"))
check("0.1+0.2 float safe: 33.33 -> 3333", M.to_minor("33.33","AUD")==3333, M.to_minor("33.33","AUD"))
check("JPY zero-decimal: 5000 -> 5000", M.to_minor("5000","JPY")==5000, M.to_minor("5000","JPY"))
check("fmt 5000 AUD", M.fmt_money(5000,"AUD")=="50.00 AUD", M.fmt_money(5000,"AUD"))
check("fmt 5000 JPY", M.fmt_money(5000,"JPY")=="5,000 JPY", M.fmt_money(5000,"JPY"))

print("\n[2] edit plan does NOT call the API to write")
CALLS.clear()
class A: pass
a=A(); a.id="AS1"; a.name=None; a.status=None; a.daily_budget="75"; a.lifetime_budget=None
M.cmd_edit(a)
writes=[c for c in CALLS if c[0]=="POST"]
check("no POST issued while planning", len(writes)==0, writes)

plan=json.load(open(MADE[-1][0]))
check("plan has 1 step", len(plan["steps"])==1)
check("budget sent as 7500 minor units", plan["steps"][0]["params"]["daily_budget"]==7500, plan["steps"][0]["params"])
check("plan starts unapplied", plan["applied"]==False)

print("\n[3] duplicate defaults to PAUSED")
CALLS.clear()
b=A(); b.id="AS1"; b.count=1; b.name=None; b.suffix=" - Copy"; b.status="PAUSED"; b.deep=False; b.into=None
M.cmd_duplicate(b)
check("no POST issued while planning", len([c for c in CALLS if c[0]=="POST"])==0)
dup=json.load(open(MADE[-1][0]))
check("status_option=PAUSED", dup["steps"][0]["params"]["status_option"]=="PAUSED", dup["steps"][0]["params"])
check("detected adset level", "campaign_id" in dup["steps"][0]["params"], dup["steps"][0]["params"])

print("\n[4] apply WITHOUT --confirm is a no-op")
CALLS.clear()
c=A(); c.plan=dup["id"]; c.confirm=False; c.again=False
M.cmd_apply(c)
check("no API calls without --confirm", len(CALLS)==0, CALLS)
check("plan still unapplied", json.load(open(os.path.join(M.PLAN_DIR,dup["id"]+".json")))["applied"]==False)

print("\n[5] apply WITH --confirm executes")
CALLS.clear()
c.confirm=True
M.cmd_apply(c)
check("one POST to /copies", len([x for x in CALLS if x[0]=="POST" and x[1].endswith("/copies")])==1, CALLS)
check("plan marked applied", json.load(open(os.path.join(M.PLAN_DIR,dup["id"]+".json")))["applied"]==True)

print("\n[6] plan ids never collide (same-second)")
CALLS.clear()
before=len(MADE)
for _ in range(3):
    d=A(); d.id="AS1"; d.count=1; d.name=None; d.suffix=" - Copy"; d.status="PAUSED"; d.deep=False; d.into=None
    M.cmd_duplicate(d)
ids=[pl["id"] for _,pl in MADE[before:]]
check("3 rapid plans got 3 distinct ids", len(set(ids))==3, ids)
check("all 3 files exist on disk", all(os.path.exists(pth) for pth,_ in MADE[before:]), ids)

print("\n[7] re-apply is blocked")
CALLS.clear()
rc=M.cmd_apply(c)
check("returns nonzero + no calls", rc==1 and len(CALLS)==0, (rc,CALLS))

print("\n"+("ALL PASSED" if not fails else f"{len(fails)} FAILURE(S): {fails}"))
sys.exit(1 if fails else 0)
