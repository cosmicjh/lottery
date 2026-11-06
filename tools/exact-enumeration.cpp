// Exact enumeration of all C(45,6)=8,145,060 main-number draws.
// Compile: g++ -O3 -std=c++17 tools/exact-enumeration.cpp -o /tmp/lotto-exact
// Usage: /tmp/lotto-exact <30 integer ticket numbers, 6 per ticket>
// Bonus number is NOT enumerated: see per-ticket analytical rank counts.
#include <iostream>
#include <cstdint>
#include <set>
#include <cstdlib>
int main(int argc, char** argv) {
  if(argc!=31) {std::cerr << "Expected 30 numbers, five groups of six\n";return 2;}
  uint64_t ticket[5]={};
  for(int i=0;i<5;i++){
    std::set<int> used;
    for(int j=0;j<6;j++){
      char* end=nullptr; long v=strtol(argv[1+i*6+j],&end,10);
      if(!end||*end||v<1||v>45||!used.insert((int)v).second){std::cerr<<"Bad ticket\n";return 2;}
      ticket[i] |= (uint64_t(1)<<(v-1));
    }
  }
  uint64_t ge[4]={}, exact[7]={}, draws=0, doubles3=0;
  for(int a=0;a<40;a++)for(int b=a+1;b<41;b++)for(int c=b+1;c<42;c++)
  for(int d=c+1;d<43;d++)for(int e=d+1;e<44;e++)for(int f=e+1;f<45;f++){
    uint64_t mask=(uint64_t(1)<<a)|(uint64_t(1)<<b)|(uint64_t(1)<<c)|(uint64_t(1)<<d)|(uint64_t(1)<<e)|(uint64_t(1)<<f);
    int best=0,three=0;
    for(int i=0;i<5;i++){
      int h=__builtin_popcountll(mask & ticket[i]);
      exact[h]++; if(h>=3)three++;if(h>best)best=h;
    }
    if(three>=2)doubles3++;
    if(best>=3)ge[0]++;if(best>=4)ge[1]++;if(best>=5)ge[2]++;if(best>=6)ge[3]++;
    draws++;
  }
  std::cout<<"{\"total\":"<<draws<<",\"atLeast3\":"<<ge[0]<<",\"atLeast4\":"<<ge[1]<<",\"atLeast5\":"<<ge[2]<<",\"atLeast6\":"<<ge[3]<<",\"drawsWithMultiple3Plus\":"<<doubles3<<",\"gameHitCounts\":[";
  for(int i=0;i<7;i++)std::cout<<(i?",":"")<<exact[i];
  std::cout<<"]}\n";
}
