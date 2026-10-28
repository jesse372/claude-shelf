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

print("\n[8] leads are not double-counted across Meta's overlapping action types")
acts=lambda **kv: {"actions":[{"action_type":k.replace("__","."),"value":str(v)} for k,v in kv.items()]}
check("lead rollup + its pixel twin = 4, not 8",
      M._lead_count(acts(lead=4, offsite_conversion__fb_pixel_lead=4))==4)
check("no rollup: pixel + onsite are disjoint = 5",
      M._lead_count(acts(offsite_conversion__fb_pixel_lead=3, onsite_conversion__lead_grouped=2))==5)
check("registration twins counted once = 2",
      M._lead_count(acts(complete_registration=2, offsite_conversion__fb_pixel_complete_registration=2))==2)
check("unrelated actions ignored", M._lead_count(acts(link_click=40, lead=1))==1)

print("\n[9] weekly verdicts")
R=lambda spend,leads,freq=1.0,name="x": {"name":name,"campaign":"C","spend":spend,"leads":leads,
      "clicks":0,"freq":freq,"cpl":spend/leads if leads else None}
wk={"a":R(600,10,name="ok"), "b":R(200,0,name="dud"), "c":R(100,8,name="star"),
    "d":R(200,1,name="pricey"), "e":R(60,2,freq=4.2,name="tired"), "f":R(500,0,name="paused")}
b,vs=M.verdicts(wk, active_ids={"a","b","c","d","e"})
got={(v,r["name"]) for v,r,_ in vs}
check("blended CPL = 1660/21", abs(b-1660/21)<1e-9, b)
check("0-lead big spender -> KILL", ("KILL","dud") in got, got)
check("2x+ average CPL -> KILL", ("KILL","pricey") in got, got)
check("cheap leads, 3+ -> SCALE", ("SCALE","star") in got, got)
check("high frequency -> TIRED", ("TIRED","tired") in got, got)
check("paused ads never judged", not any(n=="paused" for _,n in got), got)
check("average ad left alone", not any(n=="ok" for _,n in got), got)
check("KILLs listed first", vs[0][0]=="KILL", [v for v,_,_ in vs])
_,small=M.verdicts({"s":R(30,0,name="small"),"a":R(300,10)}, {"s","a"})
check("pocket-change spend not killed", not small, small)

print("\n[10] ad account auto-detected when the token sees exactly one")
saved_api, saved_acct = M.api_all, os.environ.pop("META_AD_ACCOUNT")
M.api_all=lambda p,params=None,limit_pages=25: [{"id":"act_555","name":"Only"}]
check("single account used", M.account_id()=="act_555")
os.environ.pop("META_AD_ACCOUNT")
M.api_all=lambda p,params=None,limit_pages=25: [{"id":"act_1"},{"id":"act_2"}]
try: M.account_id(); check("ambiguous -> error", False)
except M.MetaError as e: check("ambiguous -> error naming both", "act_1" in str(e) and "act_2" in str(e), e)
M.api_all=saved_api; os.environ["META_AD_ACCOUNT"]=saved_acct

print("\n[11] weekly end to end (fake Meta) + not-connected exit code")
import io, contextlib
def fake_all(path, params=None, limit_pages=25):
    if path.endswith("/ads"): return [{"id":"1","effective_status":"ACTIVE"},{"id":"2","effective_status":"ACTIVE"}]
    if path.endswith("/insights"):
        return [{"ad_id":"1","ad_name":"Gold sale reel","campaign_name":"Sale","spend":"240","frequency":"1.8",
                 "actions":[{"action_type":"lead","value":"6"},{"action_type":"offsite_conversion.fb_pixel_lead","value":"6"}]},
                {"ad_id":"2","ad_name":"Old carousel","campaign_name":"Sale","spend":"180","frequency":"2.0","actions":[]}]
    return []
M.api_all=fake_all
buf=io.StringIO()
with contextlib.redirect_stdout(buf): rc=M.cmd_weekly(None)
out=buf.getvalue()
check("weekly rc 0", rc==0, rc)
check("subject line has spend/leads/CPL", out.splitlines()[0].endswith("$420 spent, 6 leads, $70/lead"), out.splitlines()[0])
check("dud carousel flagged Turn off", "Turn off: Old carousel" in out, out)
tok=os.environ.pop("META_ACCESS_TOKEN")
check("no token -> NOT_CONNECTED", M.cmd_weekly(None)==M.NOT_CONNECTED)
os.environ["META_ACCESS_TOKEN"]=tok; M.api_all=saved_api

print("\n"+("ALL PASSED" if not fails else f"{len(fails)} FAILURE(S): {fails}"))
sys.exit(1 if fails else 0)
