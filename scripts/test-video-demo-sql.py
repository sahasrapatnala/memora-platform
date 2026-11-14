"""Actual PostgreSQL tests, synthetic fixtures; explicit disposable loopback DB only."""
import argparse, concurrent.futures, hashlib, json, pathlib, subprocess, time, uuid
ROOT=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--local-port',type=int,required=True);p.add_argument('--worker-evidence',type=pathlib.Path);a=p.parse_args()
if not 1024<=a.local_port<=65535: raise SystemExit('Dedicated local port required')
db='video_demo_test_'+uuid.uuid4().hex[:10]
base=['psql',f'host=127.0.0.1 port={a.local_port} user=lovable sslmode=disable','-X','-qAt','-v','ON_ERROR_STOP=1']
def run(text,ok=True,database=db):
 r=subprocess.run([base[0],base[1]+' dbname='+database,*base[2:],'-c',text],text=True,capture_output=True)
 if ok and r.returncode: raise AssertionError(r.stderr)
 if not ok and r.returncode==0: raise AssertionError('Expected refusal')
 return r.stdout.strip(),r.stderr
run('CREATE DATABASE '+db,database='postgres')
try:
 run((ROOT/'src/test/sql/bootstrap-local.sql').read_text())
 run('GRANT USAGE ON SCHEMA auth TO authenticated,service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated,service_role;')
 for n in range(9):run(next((ROOT/'drizzle/migrations').glob(f'{n:04}_*.sql')).read_text())
 # Reproduce LIVE broad grants, not the narrower saved migration baseline.
 run('GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;')
 run('GRANT ALL ON public.videos,public.transcript_segments,public.video_frames,public.knowledge_chunks,public.storage_analytics,public.activity_logs TO anon;')
 signatures=['public.is_workspace_member(uuid)','public.decide_processing_job(uuid,uuid,text,text)']
 baseline={s:run(f"SELECT json_build_array(prosrc,proowner,proacl)::text FROM pg_proc WHERE oid='{s}'::regprocedure")[0] for s in signatures}
 migration=(ROOT/'docs/sql-review/video-demo-v1.sql').read_text()
 run('BEGIN;'+migration+"SELECT 1/0;COMMIT;",False)
 assert run("SELECT to_regclass('public.processing_artifacts') IS NULL")[0]=='t'
 assert run("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='processing_jobs' AND column_name='dispatch_token'")[0]=='0'
 assert run("SELECT has_table_privilege('authenticated','public.videos','INSERT')")[0]=='t'
 print('PASS failed migration transaction rolls back schema and permission changes')
 run('BEGIN;'+migration+'COMMIT;')
 print('PASS migration on reconstructed 0000-0008 plus actual live grant shape')
 run('BEGIN;'+migration+'COMMIT;',False);print('PASS replay refusal')
 # ALTER search_path must preserve function bodies, owners and caller ACLs.
 # Baseline authorization bodies match the pg_get_functiondef live inspection.
 for signature in signatures:
  assert run(f"SELECT json_build_array(prosrc,proowner,proacl)::text FROM pg_proc WHERE oid='{signature}'::regprocedure")[0]==baseline[signature]
  assert run(f"SELECT proconfig @> ARRAY['search_path=\"\"'] FROM pg_proc WHERE oid='{signature}'::regprocedure")[0]=='t'
  assert run(f"SELECT has_function_privilege('authenticated','{signature}','EXECUTE')")[0]=='t'
 for table in ['videos','transcript_segments','video_frames','knowledge_chunks','storage_analytics','activity_logs']:
  for role in ['anon','authenticated']:
   for privilege in ['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']:
    assert run(f"SELECT has_table_privilege('{role}','public.{table}','{privilege}')")[0]=='f'
  assert run(f"SELECT has_table_privilege('authenticated','public.{table}','SELECT')")[0]=='t'
  for privilege in ['SELECT','INSERT','UPDATE','DELETE']:
   assert run(f"SELECT has_table_privilege('service_role','public.{table}','{privilege}')")[0]=='t'
 print('PASS exact six-table write revocations retain authenticated reads and trusted server privileges')
 u,w,other,stranger=[str(uuid.uuid4()) for _ in range(4)]
 run(f"INSERT INTO public.workspaces(id,name,owner_id) VALUES('{w}','LOCAL TEST','{u}'),('{other}','OTHER LOCAL','{stranger}'); INSERT INTO public.workspace_members(workspace_id,user_id,role) VALUES('{w}','{u}','owner'),('{other}','{stranger}','owner');")
 assert run(f"SET ROLE authenticated;SET request.jwt.claim.sub='{u}';SELECT public.is_workspace_member('{w}')")[0]=='t'
 assert run(f"SET ROLE authenticated;SET request.jwt.claim.sub='{stranger}';SELECT public.is_workspace_member('{w}')")[0]=='f'
 # Existing upload registration and deletion audit paths use trusted RPCs, not client writes.
 auditfile=run(f"SET ROLE service_role;SELECT public.register_verified_original('{u}','{w}','{u}/audit-original','audit.mp4','MP4',3,'{'a'*64}')")[0]
 assert run(f"SELECT count(*) FROM public.activity_logs WHERE file_id='{auditfile}' AND action='File uploaded'")[0]=='1'
 run(f"SET ROLE service_role;INSERT INTO public.activity_logs(workspace_id,user_id,file_name,action) VALUES('{w}','{u}','failed.mp4','File upload failed')")
 run(f"SET ROLE service_role;SELECT public.set_original_deletion('{u}','{auditfile}','Deleting');SELECT public.set_original_deletion('{u}','{auditfile}','Deleted')")
 assert run(f"SELECT count(*) FROM public.activity_logs WHERE file_id='{auditfile}' AND action='File deleted'")[0]=='1'
 print('PASS existing verified-registration, upload-failure and deletion audit DB paths retain writes; no storage IO')
 def fixture(fmt='MP4',approve=True):
  f,j=str(uuid.uuid4()),str(uuid.uuid4())
  run(f"INSERT INTO public.files(id,user_id,workspace_id,name,format,size_bytes,storage_path,sha256) VALUES('{f}','{u}','{w}','local.{fmt.lower()}','{fmt}',3,'{u}/{f}','{'a'*64}'); INSERT INTO public.processing_jobs(id,file_id,user_id,workspace_id,status) VALUES('{j}','{f}','{u}','{w}','Approved');")
  if approve:run(f"INSERT INTO public.approval_requests(user_id,file_id,workspace_id,processing_job_id,reason,status) VALUES('{u}','{f}','{w}','{j}','LOCAL TEST','Approved');")
  return f,j
 # Real authenticated RPC execution with the hardened empty path, not a mocked client.
 for decision in ['Approved','Rejected']:
  reviewfile,reviewjob=fixture(approve=False)
  run(f"UPDATE public.processing_jobs SET status='Awaiting Review' WHERE id='{reviewjob}'")
  args=f"'{reviewjob}','{w}','{decision}','Local review reason'"
  run(f"SET ROLE authenticated;SET request.jwt.claim.sub='{stranger}';SELECT * FROM public.decide_processing_job({args})",False)
  run(f"SET ROLE authenticated;SET request.jwt.claim.sub='{u}';SELECT * FROM public.decide_processing_job('{reviewjob}','{w}','{decision}','')",False)
  assert run(f"SET ROLE authenticated;SET request.jwt.claim.sub='{u}';SELECT job_status FROM public.decide_processing_job({args})")[0]==decision
  assert run(f"SET ROLE authenticated;SET request.jwt.claim.sub='{u}';SELECT reused FROM public.decide_processing_job({args})")[0]=='t'
  assert run(f"SELECT count(*) FROM public.approval_requests WHERE processing_job_id='{reviewjob}'")[0]=='1'
 print('PASS empty-path membership/RLS and existing approve/reject/reason/replay/nonmember workflows')
 def claim(j,actor=u):return run(f"SET ROLE service_role; SELECT dispatch_token FROM public.claim_approved_processing_job('{j}','{w}','{actor}','worker',300)")[0]
 def identity(j,t):return f"'{j}','{w}','{t}','worker'"
 def manifest(j,t):
  return dict(action='complete',version=1,job_id=j,workspace_id=w,dispatch_token=t,worker_id='worker',kind='video',format='MP4',metadata={'speaker_attribution':'unavailable','extraction':'Faster-Whisper and OpenCV'},duration_seconds=2,language='en',speakers=[],speaker_turns=[],pages=[],slides=[],transcript_segments=[dict(start_seconds=0,end_seconds=1,content='LOCAL speech',content_sha256=hashlib.sha256(b'LOCAL speech').hexdigest(),speaker_key=None)],frames=[dict(timestamp_seconds=1,storage_path=f'{w}/{j}/{t}/frame-'+('b'*64)+'.jpg',size_bytes=3,sha256='b'*64,thumbnail_path=f'{w}/{j}/{t}/thumbnail-'+('c'*64)+'.jpg',thumbnail_size_bytes=3,thumbnail_sha256='c'*64)])
 def receipts(j,t):
  for kind,h in [('frame','b'*64),('thumbnail','c'*64)]:run(f"SET ROLE service_role; SELECT public.register_processing_artifact({identity(j,t)},'{kind}','{w}/{j}/{t}/{kind}-{h}.jpg',3,'{h}')")
 def finish(j,t,m,ok=True):return run(f"SET ROLE service_role; SELECT public.finalize_processing_attempt({identity(j,t)},'{json.dumps(m)}'::jsonb,'{'d'*64}')",ok)
 f,j=fixture();run(f"SET ROLE service_role;SELECT * FROM public.claim_approved_processing_job('{j}','{w}','{stranger}','worker',300)",False)
 _,no=fixture(approve=False);run(f"SET ROLE service_role;SELECT * FROM public.claim_approved_processing_job('{no}','{w}','{u}','worker',300)",False)
 _,pdf=fixture('PDF');run(f"SET ROLE service_role;SELECT * FROM public.claim_approved_processing_job('{pdf}','{w}','{u}','worker',300)",False)
 print('PASS reviewer, approval and video-only claim enforcement')
 t=claim(j);assert t
 run(f"SET ROLE service_role;SELECT public.progress_processing_attempt({identity(j,t)},'Transcribing audio',45,300)")
 run(f"SET ROLE service_role;SELECT public.progress_processing_attempt({identity(j,t)},'Transcribing audio',30,300)")
 assert run(f"SELECT progress FROM public.processing_jobs WHERE id='{j}'")[0]=='45'
 run(f"SET ROLE service_role;SELECT public.progress_processing_attempt({identity(j,t)},'Extracting document',60,300)",False)
 print('PASS current heartbeat progress renews lease without regression; document stages rejected')
 assert claim(j)=='';print('PASS active duplicate claim rejected')
 stale=str(uuid.uuid4());run(f"SET ROLE service_role;SELECT public.assert_processing_attempt({identity(j,stale)})",False)
 run(f"SET ROLE service_role;SELECT public.assert_processing_attempt('{j}','{other}','{t}','worker')",False)
 print('PASS stale token and cross-workspace attempt denial')
 receipts(j,t);m=manifest(j,t)
 finish(j,stale,manifest(j,stale),False)
 run(f"SET ROLE service_role;SELECT public.fail_processing_attempt({identity(j,stale)},'ProcessorFailed')",False)
 print('PASS stale finalization and stale failure callbacks rejected')
 run(f"UPDATE public.processing_artifacts SET dispatch_token='{stale}' WHERE job_id='{j}' AND kind='frame'")
 finish(j,t,m,False);assert run('SELECT count(*) FROM public.videos')[0]=='0'
 run(f"UPDATE public.processing_artifacts SET dispatch_token='{t}',workspace_id='{other}' WHERE job_id='{j}' AND kind='frame'")
 finish(j,t,m,False)
 run(f"UPDATE public.processing_artifacts SET workspace_id='{w}' WHERE job_id='{j}' AND kind='frame'")
 print('PASS old-attempt and cross-workspace receipt rejection; no result rows')
 run("CREATE FUNCTION public.test_delay() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(.4);RETURN NEW;END $$;CREATE TRIGGER test_delay AFTER INSERT ON public.processing_results FOR EACH ROW EXECUTE FUNCTION public.test_delay();")
 run(f"UPDATE public.processing_jobs SET lease_expires_at=clock_timestamp()+interval '.2 second' WHERE id='{j}'")
 _,err=finish(j,t,m,False);assert 'during finalization' in err,err
 for table in ['videos','transcript_segments','video_frames','knowledge_chunks','processing_results','storage_analytics']:assert run('SELECT count(*) FROM public.'+table)[0]=='0'
 run('DROP TRIGGER test_delay ON public.processing_results;DROP FUNCTION public.test_delay();')
 print('PASS expiry DURING finalization rolls back every result/accounting write')
 run(f"SET ROLE service_role;SELECT public.progress_processing_attempt({identity(j,t)},'Transcribing audio',45,300)",False)
 new=claim(j);assert new!=t;receipts(j,new);m=manifest(j,new)
 assert finish(j,new,m)[0]=='Completed';assert finish(j,new,m)[0]=='Completed'
 assert run('SELECT count(*) FROM public.videos')[0]=='1'
 assert run('SELECT count(*) FROM public.transcript_segments')[0]=='1'
 print('PASS expired lease recovery creates fresh token; finalization/replay and separate-connection persistence')
 # No exception for NULL-lineage legacy imports or corrections: none is an existing app workflow.
 # Trusted arbitrary writes must still fail; context is scoped to the finalizer transaction.
 vid=run(f"SELECT id FROM public.videos WHERE processing_job_id='{j}'")[0]
 updates={'videos':'duration_seconds=3','transcript_segments':"content='unverified correction'",'video_frames':'timestamp_seconds=0','knowledge_chunks':"content='unverified correction'"}
 inserts={
  'videos':f"(workspace_id,file_id) VALUES('{w}','{auditfile}')",
  'transcript_segments':f"(workspace_id,video_id,start_seconds,end_seconds,content) VALUES('{w}','{vid}',0,1,'unverified')",
  'video_frames':f"(workspace_id,video_id,timestamp_seconds,storage_path,size_bytes) VALUES('{w}','{vid}',0,'unverified.jpg',3)",
  'knowledge_chunks':f"(workspace_id,file_id,content,source_reference) VALUES('{w}','{f}','unverified','{{}}')"}
 for table in updates:
  _,err=run(f"SET ROLE service_role;UPDATE public.{table} SET {updates[table]} WHERE processing_job_id='{j}'",False)
  assert 'Verified fenced ingestion context required' in err,err
  _,err=run(f"SET ROLE service_role;INSERT INTO public.{table}{inserts[table]}",False)
  assert 'Verified fenced ingestion context required' in err,err
  _,err=run(f"SET ROLE authenticated;SET request.jwt.claim.sub='{u}';SET memora.verified_ingestion='{j}';UPDATE public.{table} SET {updates[table]} WHERE processing_job_id='{j}'",False)
  assert 'permission denied' in err,err
 print('PASS all four ingestion triggers reject unverified INSERT/UPDATE; client-forged context cannot bypass revoked writes')
 assert run(f"SET ROLE authenticated;SET request.jwt.claim.sub='{u}';SELECT count(*) FROM public.transcript_segments")[0]=='1'
 assert run(f"SET ROLE authenticated;SET request.jwt.claim.sub='{stranger}';SELECT count(*) FROM public.transcript_segments")[0]=='0'
 for table in ['videos','transcript_segments','video_frames','knowledge_chunks','processing_artifacts','processing_results']:
  assert run(f"SET ROLE authenticated;SET request.jwt.claim.sub='{stranger}';SELECT count(*) FROM public.{table}")[0]=='0'
 run(f"SET ROLE authenticated;SELECT public.assert_processing_attempt({identity(j,new)})",False)
 run(f"SET ROLE authenticated;INSERT INTO public.knowledge_chunks(workspace_id,file_id,content) VALUES('{w}','{f}','fake')",False)
 print('PASS member refresh reads, nonmember RLS isolation and direct client write/RPC denial')
 # A second successful version cannot overwrite the first result.
 run(f"INSERT INTO public.processing_jobs(file_id,user_id,workspace_id,status) VALUES('{f}','{u}','{w}','Approved') RETURNING id")
 second=run(f"SELECT id FROM public.processing_jobs WHERE file_id='{f}' AND status='Approved'")[0]
 run(f"INSERT INTO public.approval_requests(user_id,file_id,workspace_id,processing_job_id,reason,status) VALUES('{u}','{f}','{w}','{second}','LOCAL TEST','Approved')")
 run(f"SET ROLE service_role;SELECT * FROM public.claim_approved_processing_job('{second}','{w}','{u}','worker',300)",False)
 print('PASS existing successful video preserved; reprocessing refused')
 _,concurrent_job=fixture()
 holder=subprocess.Popen([base[0],base[1]+' dbname='+db,*base[2:],'-c',f"BEGIN;SELECT id FROM public.processing_jobs WHERE id='{concurrent_job}' FOR UPDATE;SELECT pg_sleep(1);COMMIT;"],stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 # Observe the actual lock before issuing the competing selected claim.
 for _ in range(100):
  if run("SELECT count(*) FROM pg_stat_activity WHERE datname='"+db+"' AND wait_event='PgSleep'")[0]!='0':break
  time.sleep(.01)
 else:raise AssertionError('Local lock fixture did not start')
 assert claim(concurrent_job)==''
 holder.wait(timeout=5);assert holder.returncode==0
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
  tokens=list(pool.map(lambda _:claim(concurrent_job),range(2)))
 assert sum(bool(value) for value in tokens)==1
 assert run(f"SELECT dispatch_attempts FROM public.processing_jobs WHERE id='{concurrent_job}'")[0]=='1'
 print('PASS locked requested job SKIP LOCKED; two real connections produce one claim/attempt')
 _,cancelled=fixture();ct=claim(cancelled)
 assert run(f"SET ROLE service_role;SELECT public.cancel_processing_attempt('{cancelled}','{w}','{u}')")[0]=='Cancelled'
 finish(cancelled,ct,manifest(cancelled,ct),False)
 print('PASS reviewer cancellation invalidates completion token')
 if a.worker_evidence:
  original,realjob=fixture();realtoken=claim(realjob)
  extracted=json.loads(a.worker_evidence.read_text())['manifest']
  actual=json.loads(json.dumps(extracted))
  for frame in actual['frames']:
   for kind,pathkey in [('frame','path'),('thumbnail','thumbnail_local_path')]:
    path=pathlib.Path(frame[pathkey]);size=path.stat().st_size;digest=hashlib.sha256(path.read_bytes()).hexdigest()
    stored=f'{w}/{realjob}/{realtoken}/{kind}-{digest}.jpg'
    run(f"SET ROLE service_role;SELECT public.register_processing_artifact({identity(realjob,realtoken)},'{kind}','{stored}',{size},'{digest}')")
    frame['storage_path' if kind=='frame' else 'thumbnail_path']=stored
    frame['size_bytes' if kind=='frame' else 'thumbnail_size_bytes']=size
    frame['sha256' if kind=='frame' else 'thumbnail_sha256']=digest
   for key in list(frame):
    if key not in ['timestamp_seconds','storage_path','size_bytes','sha256','thumbnail_path','thumbnail_size_bytes','thumbnail_sha256']:del frame[key]
  actual.update(action='complete',version=1,job_id=realjob,workspace_id=w,dispatch_token=realtoken,worker_id='worker')
  assert finish(realjob,realtoken,actual)[0]=='Completed'
  assert run(f"SELECT count(*) FROM public.transcript_segments WHERE processing_job_id='{realjob}'")[0]==str(len(actual['transcript_segments']))
  print('PASS genuine earlier Whisper/OpenCV output accepted by SQL; artifact registration simulated locally, NOT Cloud transport')
 _,retry=fixture()
 for attempt in range(3):
  tt=claim(retry);assert tt
  status=run(f"SET ROLE service_role;SELECT public.fail_processing_attempt({identity(retry,tt)},'ProcessorFailed')")[0]
  assert status==('Failed' if attempt==2 else 'Approved')
  run(f"SET ROLE service_role;SELECT public.assert_processing_attempt({identity(retry,tt)})",False)
 assert claim(retry)==''
 print('PASS failed processing invalidates tokens; three-attempt cap ends Failed')
 _,expired=fixture()
 for attempt in range(3):
  et=claim(expired);assert et
  run(f"UPDATE public.processing_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id='{expired}'")
 assert run(f"SET ROLE service_role;SELECT outcome FROM public.claim_approved_processing_job('{expired}','{w}','{u}','worker',300)")[0]=='AttemptsExhausted'
 print('PASS expired attempts cannot be reclaimed indefinitely')
 _,revoked=fixture();rt=claim(revoked)
 run(f"UPDATE public.workspace_members SET role='member' WHERE workspace_id='{w}' AND user_id='{u}'")
 run(f"SET ROLE service_role;SELECT public.assert_processing_attempt({identity(revoked,rt)})",False)
 print('PASS reviewer revocation stops ongoing attempts')
 print('ALL LOCAL SQL TESTS PASSED; no live Cloud operations or real extraction in these SQL fixtures')
finally:run('DROP DATABASE '+db+' WITH (FORCE)',database='postgres')
