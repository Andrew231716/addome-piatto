/** Isolated GitHub Contents API fake: never contacts the user's account. */
export function mockGitHub() {
  const files=new Map<string,{sha:string;content:string}>();let version=0;let branchExists=false;
  const original=globalThis.fetch;
  globalThis.fetch=(async(input: string | URL | Request,init?:RequestInit)=>{
    const url=String(input);
    if(!url.startsWith('https://api.github.com/'))return original(input,init);
    const path=new URL(url).pathname;
    if(path.includes('/git/ref/heads/')) { if(path.endsWith('/gym-data')&&!branchExists)return Response.json({message:'Not found'},{status:404}); return Response.json({object:{sha:'base'}}); }
    if(path.endsWith('/git/refs')&&init?.method==='POST'){branchExists=true;return Response.json({ok:true});}
    if(path.endsWith('/repos/test/data'))return Response.json({default_branch:'main'});
    if(path.includes('/contents/')){
      const name=path.split('/contents/')[1];const previous=files.get(name);
      if(init?.method==='PUT'){
        const body=JSON.parse(String(init.body));
        if(previous&&body.sha!==previous.sha)return Response.json({error:'Conflict'},{status:409});
        files.set(name,{sha:String(++version),content:body.content});return Response.json({ok:true});
      }
      return previous?Response.json(previous):Response.json({message:'Not found'},{status:404});
    }
    return Response.json({message:'Unknown test route'},{status:404});
  }) as typeof fetch;
  process.env.GITHUB_REPO='test/data';process.env.GITHUB_TOKEN='test-only';
  process.env.GYM_AUTH_SECRET='ab'.repeat(32);
  return {files,restore:()=>{globalThis.fetch=original;}};
}
