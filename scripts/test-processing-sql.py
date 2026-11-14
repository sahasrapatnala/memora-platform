"""Execute actual draft SQL ONLY against a newly created disposable local database.
Never reads PG* or production credentials. Requires explicit --local-port and postgres OS user.
"""
import argparse, hashlib, json, subprocess, pathlib, uuid
ROOT=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--local-port',type=int,required=True);a=p.parse_args()
if not 1024<=a.local_port<=65535: raise SystemExit('Use a dedicated loopback PostgreSQL port')
db='memora_acceptance_'+uuid.uuid4().hex[:12]
base=['psql',f'host=127.0.0.1 port={a.local_port} user=lovable sslmode=disable','-X','-v','ON_ERROR_STOP=1','-At']
def sql(text,ok=True):
 r=subprocess.run([base[0],base[1]+' dbname='+db]+base[2:]+['-c',text],capture_output=True,text=True)
 if ok and r.returncode: raise RuntimeError(r.stderr)
 if not ok and not r.returncode: raise AssertionError('Expected SQL refusal')
 return r.stdout.strip(),r.stderr
subprocess.run([base[0],base[1]+' dbname=postgres']+base[2:]+['-c',f'CREATE DATABASE {db}'],check=True,capture_output=True)
try:
 sql((ROOT/'src/test/sql/bootstrap-local.sql').read_text())
 for n in range(9):
  file=next((ROOT/'drizzle/migrations').glob(f'{n:04}_*.sql'));sql(file.read_text())
 dispatch=(ROOT/'docs/sql-review/dispatch-v3.sql').read_text();ingestion=(ROOT/'docs/sql-review/processing-ingestion-v4.sql').read_text()
 sql('BEGIN;'+dispatch+'COMMIT;');sql('BEGIN;'+ingestion+'COMMIT;')
 print('PASS full v3/v4 execution on reconstructed local baseline 0000–0008; historical 0009 not replayed')
 sql('BEGIN;'+ingestion+'COMMIT;',False);sql('BEGIN;'+dispatch+'COMMIT;',False)
 print('PASS repeated ingestion refusal and post-ingestion dispatch refusal')
 w='22222222-2222-4222-8222-222222222222';u='11111111-1111-4111-8111-111111111111';f='33333333-3333-4333-8333-333333333333';job='44444444-4444-4444-8444-444444444444'
 sql(f"INSERT INTO public.workspaces(id,name,owner_id) VALUES('{w}','LOCAL SYNTHETIC','{u}'); INSERT INTO public.workspace_members(workspace_id,user_id,role) VALUES('{w}','{u}','owner'); INSERT INTO public.files(id,user_id,workspace_id,name,format,size_bytes,storage_path,sha256) VALUES('{f}','{u}','{w}','fixture.mp4','MP4',3,'{u}/fixture.mp4','{'a'*64}'); INSERT INTO public.processing_jobs(id,file_id,user_id,workspace_id,status) VALUES('{job}','{f}','{u}','{w}','Approved'); INSERT INTO public.approval_requests(user_id,file_id,workspace_id,processing_job_id,reason,status) VALUES('{u}','{f}','{w}','{job}','LOCAL TEST','Approved');")
 token=sql(f"SELECT dispatch_token FROM public.claim_approved_processing_job('{job}','{w}','{u}','worker',300)")[0]
 def artifact(kind,hash):
  path=f'{w}/{job}/{token}/{kind}-{hash}.jpg';sql(f"SELECT public.register_processing_artifact('{job}','{w}','{token}','worker','{kind}','{path}',3,'{hash}')");return path
 frame=artifact('frame','b'*64);thumb=artifact('thumbnail','c'*64)
 manifest={'action':'complete','version':1,'job_id':job,'workspace_id':w,'dispatch_token':token,'worker_id':'worker','kind':'video','format':'MP4','metadata':{},'duration_seconds':2,'language':'en','speakers':[],'speaker_turns':[],'transcript_segments':[{'start_seconds':0,'end_seconds':1,'content':'LOCAL TEST','content_sha256':hashlib.sha256(b'LOCAL TEST').hexdigest(),'speaker_key':None}], 'frames':[{'timestamp_seconds':1,'storage_path':frame,'size_bytes':3,'sha256':'b'*64,'thumbnail_path':thumb,'thumbnail_size_bytes':3,'thumbnail_sha256':'c'*64}],'pages':[],'slides':[]}
 call=lambda m: f"SELECT public.finalize_processing_attempt('{job}','{w}','{token}','worker','{json.dumps(m)}'::jsonb,'{'d'*64}');"
 # Insert test-only sleep trigger AFTER generated result writes, before conditional Completed.
 sql("CREATE FUNCTION public.test_delay_finalization() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.4); RETURN NEW; END $$; CREATE TRIGGER test_delay AFTER INSERT ON public.processing_results FOR EACH ROW EXECUTE FUNCTION public.test_delay_finalization();")
 sql(f"UPDATE public.processing_jobs SET lease_expires_at=clock_timestamp()+interval '0.2 second' WHERE id='{job}'")
 _,err=sql(call(manifest),False);assert 'during finalization' in err,err
 assert sql('SELECT count(*) FROM public.videos')[0]=='0'
 assert sql('SELECT count(*) FROM public.transcript_segments')[0]=='0'
 assert sql('SELECT count(*) FROM public.knowledge_chunks')[0]=='0'
 assert sql('SELECT count(*) FROM public.processing_results')[0]=='0'
 assert sql('SELECT count(*) FROM public.storage_analytics')[0]=='0'
 assert sql(f"SELECT status FROM public.processing_jobs WHERE id='{job}'")[0]=='Processing'
 print('PASS lease expiry during delayed actual finalization; video/transcript/knowledge/result/analytics rolled back, job not Completed')
 sql('DROP TRIGGER test_delay ON public.processing_results; DROP FUNCTION public.test_delay_finalization();')
 sql(f"UPDATE public.processing_jobs SET lease_expires_at=clock_timestamp()+interval '5 minutes' WHERE id='{job}'")
 # corrupt receipt token and workspace independently without application validators
 sql(f"UPDATE public.processing_artifacts SET dispatch_token=gen_random_uuid() WHERE kind='frame'")
 _,err=sql(call(manifest),False);assert 'Frame artifacts' in err,err
 sql(f"UPDATE public.processing_artifacts SET dispatch_token='{token}' WHERE kind='frame'")
 other='55555555-5555-4555-8555-555555555555';sql(f"INSERT INTO public.workspaces(id,name,owner_id) VALUES('{other}','OTHER LOCAL','{u}'); UPDATE public.processing_artifacts SET workspace_id='{other}' WHERE kind='frame'")
 _,err=sql(call(manifest),False);assert 'Frame artifacts' in err,err
 assert sql('SELECT count(*) FROM public.videos')[0]=='0'
 print('PASS stale-token artifact and cross-workspace artifact rejection by database; rollback confirmed')
 sql(f"UPDATE public.processing_artifacts SET workspace_id='{w}' WHERE kind='frame'")
 assert sql(call(manifest))[0]=='Completed'
 assert sql('SELECT count(*) FROM public.transcript_segments')[0]=='1'
 print('PASS current receipt finalization and durable readback in separate local SQL connection')
 summaries=(ROOT/'docs/sql-review/source-summaries-v7.sql').read_text();sql('BEGIN;'+summaries+'COMMIT;');sql('BEGIN;'+summaries+'COMMIT;',False)
 chunk=sql('SELECT id FROM public.knowledge_chunks LIMIT 1')[0]
 citations=json.dumps([{'chunkId':chunk,'fileId':f,'fileName':'fixture.mp4','label':'LOCAL TEST','to':f'/videos/{f}?t=0'}])
 args=f"'{w}','{f}','{u}','LOCAL summary [1]',ARRAY['{chunk}'::uuid],'{citations}'::jsonb,'openai/gpt-6-astra','{{}}'::jsonb,'{'e'*64}','{'f'*64}'"
 sql(f"BEGIN;SET LOCAL request.jwt.claim.sub='{u}';SELECT public.save_source_summary({args});COMMIT;")
 sql(f"BEGIN;SET LOCAL request.jwt.claim.sub='{u}';SELECT public.save_source_summary({args});COMMIT;")
 assert sql('SELECT count(*) FROM public.source_summaries')[0]=='1'
 assert sql(f"SET ROLE authenticated;SET request.jwt.claim.sub='{u}';SELECT answer FROM public.source_summaries;")[0].splitlines()[-1]=='LOCAL summary [1]'
 stranger='66666666-6666-4666-8666-666666666666'
 assert sql(f"SET ROLE authenticated;SET request.jwt.claim.sub='{stranger}';SELECT count(*) FROM public.source_summaries;")[0].splitlines()[-1]=='0'
 print('PASS durable summary separate-connection refresh readback, duplicate reuse, nonmember RLS isolation; no AI service called')
 assert sql(f"SET ROLE authenticated; SELECT public.save_source_summary({args});",False)[1].find('permission denied')>=0
 print('PASS direct authenticated summary-write RPC denied')
 sql(f"INSERT INTO public.transcript_segments(workspace_id,video_id,processing_job_id,start_seconds,end_seconds,content) SELECT '{w}',v.id,NULL,i,i+0.5,'LOCAL pagination' FROM public.videos v CROSS JOIN generate_series(1,1251) i;",False)
 print('PASS ingestion guards retained: direct output insertion refused')


finally:
 subprocess.run([base[0],base[1]+' dbname=postgres']+base[2:]+['-c',f'DROP DATABASE {db} WITH (FORCE)'],check=True,capture_output=True)
