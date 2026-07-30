(function(){
  var input=document.getElementById('q'), box=document.getElementById('results');
  if(!input||!box) return;
  var idx=null, loading=false;
  function load(){
    if(idx||loading) return; loading=true;
    fetch('/help/search-index.json').then(function(r){return r.json()})
      .then(function(d){idx=d;loading=false;if(input.value)run()});
  }
  function run(){
    var q=input.value.trim().toLowerCase();
    if(!q||!idx){box.style.display='none';return}
    var terms=q.split(/\s+/);
    var hits=idx.map(function(a){
      var hay=(a.t+' '+a.c+' '+a.k+' '+a.s).toLowerCase();
      var score=0;
      for(var i=0;i<terms.length;i++){
        if(hay.indexOf(terms[i])===-1) return null;
        if(a.t.toLowerCase().indexOf(terms[i])!==-1) score+=10;
        if(a.k.toLowerCase().indexOf(terms[i])!==-1) score+=4;
        score+=1;
      }
      return {a:a,score:score};
    }).filter(Boolean).sort(function(x,y){return y.score-x.score}).slice(0,8);
    if(!hits.length){box.innerHTML='<div class="empty">No results for &ldquo;'+
      q.replace(/</g,'&lt;')+'&rdquo;</div>';box.style.display='block';return}
    box.innerHTML=hits.map(function(h){
      return '<a href="'+h.a.u+'"><div class="t">'+h.a.t+'</div><div class="c">'+h.a.c+'</div></a>';
    }).join('');
    box.style.display='block';
  }
  input.addEventListener('focus',load);
  input.addEventListener('input',run);
  document.addEventListener('click',function(e){
    if(!box.contains(e.target)&&e.target!==input) box.style.display='none';
  });
})();