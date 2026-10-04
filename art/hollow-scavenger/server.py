from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
import json,base64
root=Path(__file__).resolve().parents[2]
lead=root.parent/'lead'
class Handler(SimpleHTTPRequestHandler):
 def do_POST(self):
  if self.path!='/capture':self.send_error(404);return
  size=int(self.headers.get('Content-Length','0'))
  if size>30_000_000:self.send_error(413);return
  payload=json.loads(self.rfile.read(size));out=root/'art/hollow-scavenger/frames-v2';out.mkdir(exist_ok=True)
  for i,frame in enumerate(payload['frames']):
   (out/f'{i:03d}.jpg').write_bytes(base64.b64decode(frame.split(',',1)[1]))
  (out/'capture.json').write_text(json.dumps({k:v for k,v in payload.items() if k!='frames'},indent=2))
  self.send_response(200);self.end_headers();self.wfile.write(b'CAPTURE SAVED')
 def translate_path(self,path):
  if path.startswith('/lead/'):
   tail=path.split('?',1)[0][6:];candidate=(lead/tail).resolve()
   if lead.resolve() not in candidate.parents:return '/missing'
   return str(candidate)
  return str(root/path.split('?',1)[0].lstrip('/'))
ThreadingHTTPServer(('127.0.0.1',8876),Handler).serve_forever()
