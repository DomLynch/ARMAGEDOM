"""Real PostgreSQL RLS/grants/CAS/rollback. Auth schema is a fixture, not Auth/API proof."""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
BIN = Path(os.environ.get('ARMAGEDOM_PG_BIN', '/opt/homebrew/opt/postgresql@17/bin'))
A, B = '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'
PAYLOAD = '{"character":"vagrant","area":"westminster","equipment":[]}'
class Database(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not (BIN / 'postgres').is_file():
            raise RuntimeError('Set ARMAGEDOM_PG_BIN to PostgreSQL 17 bin; database proof NOT RUN')
        cls.temp = tempfile.TemporaryDirectory(prefix='armagedom-db-')
        cls.base = Path(cls.temp.name)
        cls.started = False
        try:
            subprocess.run([str(BIN/'initdb'),'-D',str(cls.base/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
            subprocess.run([str(BIN/'pg_ctl'),'-D',str(cls.base/'data'),'-l',str(cls.base/'log'),'-o',
                            f"-k {cls.base} -p 55449 -c listen_addresses=''",'-w','start'],check=True,capture_output=True)
            cls.started = True
            cls.sql('''create role anon nologin; create role authenticated nologin;
              create schema auth; create table auth.users(id uuid primary key);
              create function auth.jwt() returns jsonb language sql stable as
                $$ select current_setting('request.jwt.claims',true)::jsonb $$;
              create function auth.uid() returns uuid language sql stable as
                $$ select (auth.jwt()->>'sub')::uuid $$;
              grant usage on schema auth to anon,authenticated;
              grant execute on function auth.uid(),auth.jwt() to anon,authenticated;''')
            cls.sql(f"insert into auth.users values ('{A}'),('{B}')")
            cls.migration = next((ROOT/'supabase/migrations').glob('*.sql')).read_text()
            cls.sql(cls.migration)
        except Exception:
            cls.tearDownClass()
            raise
    @classmethod
    def tearDownClass(cls):
        if cls.started:
            subprocess.run([str(BIN/'pg_ctl'),'-D',str(cls.base/'data'),'-m','immediate','-w','stop'],capture_output=True,check=True)
        cls.temp.cleanup()
    @classmethod
    def sql(cls, text, user=None, role='authenticated', fail=False, anonymous=False):
        if user or role == 'anon':
            claims = json.dumps({'sub':user,'is_anonymous':anonymous})
            text = f"set role {role}; set request.jwt.claims='{claims}'; " + text
        r = subprocess.run([str(BIN/'psql'),'-X','-qAt','-v','ON_ERROR_STOP=1','-h',str(cls.base),
                            '-p','55449','-U','postgres','postgres','-c',text],capture_output=True,text=True)
        if fail:
            if r.returncode == 0: raise AssertionError('Expected database rejection, statement succeeded')
            return r.stderr
        if r.returncode: raise AssertionError(r.stderr)
        return r.stdout.strip()
    def setUp(self):
        self.sql('truncate public.armagedom_profiles,public.armagedom_character_saves')
    def seed(self,user=A):
        return self.sql(f"insert into public.armagedom_character_saves(user_id,payload) values ('{user}','{PAYLOAD}') returning revision",user=user)
    def test_owner_profile_and_save(self):
        self.assertEqual(self.seed(),'1')
        self.sql(f"insert into public.armagedom_profiles values ('{A}','Dom')",user=A)
        self.assertEqual(self.sql('select display_name from public.armagedom_profiles',user=A),'Dom')
        self.assertEqual(self.sql("update public.armagedom_profiles set display_name='Dom renamed' returning display_name",user=A),'Dom renamed')
        self.assertEqual(self.sql('select trust from public.armagedom_character_saves',user=A),'unvalidated_prototype')
    def test_cross_user_reads_updates_and_profile_isolation(self):
        self.seed(B);self.sql(f"insert into public.armagedom_profiles values ('{B}','B')",user=B)
        self.assertEqual(self.sql('select count(*) from public.armagedom_character_saves',user=A),'0')
        self.assertEqual(self.sql('select count(*) from public.armagedom_profiles',user=A),'0')
        self.assertEqual(self.sql(f"update public.armagedom_character_saves set payload='{PAYLOAD}' returning revision",user=A),'')
        self.assertEqual(self.sql("update public.armagedom_profiles set display_name='stolen' returning user_id",user=A),'')
    def test_cross_user_insert_rejected(self):
        for table,cols,values in [('armagedom_profiles','user_id,display_name',f"'{B}','stolen'"),
                                 ('armagedom_character_saves','user_id,payload',f"'{B}','{PAYLOAD}'")]:
            self.assertIn('row-level security',self.sql(f'insert into public.{table}({cols}) values ({values})',user=A,fail=True))
    def test_anon_no_access(self):
        self.seed()
        for table in ['armagedom_profiles','armagedom_character_saves']:
            for q in [f'select * from public.{table}',f'delete from public.{table}']:
                self.assertIn('permission denied',self.sql(q,role='anon',fail=True))
        self.assertIn('permission denied',self.sql(f"insert into public.armagedom_profiles values ('{A}','x')",role='anon',fail=True))
        self.assertIn('permission denied',self.sql("update public.armagedom_profiles set display_name='x'",role='anon',fail=True))
        self.assertIn('permission denied',self.sql(f"insert into public.armagedom_character_saves(user_id,payload) values ('{A}','{PAYLOAD}')",role='anon',fail=True))
        self.assertIn('permission denied',self.sql(f"update public.armagedom_character_saves set payload='{PAYLOAD}'",role='anon',fail=True))
    def test_anonymous_authenticated_user_rejected(self):
        self.assertIn('row-level security',self.sql(f"insert into public.armagedom_character_saves(user_id,payload) values ('{A}','{PAYLOAD}')",user=A,anonymous=True,fail=True))
    def test_metadata_cannot_be_written(self):
        self.seed()
        for field,value in [('user_id',f"'{B}'"),('revision','20'),('trust',"'validated'"),('schema_version','2'),('updated_at','now()')]:
            self.assertIn('permission denied',self.sql(f'update public.armagedom_character_saves set {field}={value}',user=A,fail=True))
        self.assertIn('permission denied',self.sql(f"update public.armagedom_profiles set user_id='{B}'",user=A,fail=True))
        self.assertIn('permission denied',self.sql(f"insert into public.armagedom_character_saves(user_id,payload,revision) values ('{B}','{PAYLOAD}',999)",user=B,fail=True))
    def test_invalid_payloads_rejected_in_database(self):
        for payload in ['{}','[]',PAYLOAD[:-1]+',"currency":999}',
                        '{"character":"vagrant","area":"mars","equipment":[]}',
                        '{"character":"vagrant","area":"east","equipment":[3]}']:
            self.assertIn('check constraint',self.sql(f"insert into public.armagedom_character_saves(user_id,payload) values ('{A}','{payload}')",user=A,fail=True))
        self.assertIn('check constraint',self.sql(f"insert into public.armagedom_character_saves(user_id,payload) values ('{A}',jsonb_build_object('character',repeat('a',33000),'area','east','equipment','[]'::jsonb))",user=A,fail=True))
    def test_stale_write_and_revision_increment(self):
        self.seed()
        q=f"update public.armagedom_character_saves set payload='{PAYLOAD}' where revision=1 returning revision"
        self.assertEqual(self.sql(q,user=A),'2');self.assertEqual(self.sql(q,user=A),'')
    def test_concurrent_update_one_winner(self):
        self.seed()
        q=f"update public.armagedom_character_saves set payload='{PAYLOAD}' where revision=1 returning revision"
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            results=list(pool.map(lambda _:self.sql(q,user=A),range(2)))
        self.assertEqual(sorted(results),['','2'])
    def test_initial_race_one_winner(self):
        def write(_):
            try:return self.seed()
            except AssertionError as e:
                self.assertIn('duplicate key',str(e));return 'conflict'
        with concurrent.futures.ThreadPoolExecutor(2) as pool:results=list(pool.map(write,range(2)))
        self.assertEqual(sorted(results),['1','conflict'])
    def test_delete_denied_and_account_cascade(self):
        self.seed();self.assertIn('permission denied',self.sql('delete from public.armagedom_character_saves',user=A,fail=True))
        self.sql(f"delete from auth.users where id='{A}'")
        self.assertEqual(self.sql('select count(*) from public.armagedom_character_saves'),'0')
        self.sql(f"insert into auth.users values ('{A}')")
    def test_rollback_and_reapply(self):
        self.sql((ROOT/'sql/rollback.sql').read_text())
        self.assertEqual(self.sql("select count(*) from pg_tables where schemaname='public' and tablename like 'armagedom_%'"),'0')
        self.sql(self.migration);self.assertEqual(self.seed(),'1')

if __name__=='__main__':unittest.main(verbosity=2)
