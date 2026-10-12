import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser', timeout:90000, workers:1, retries:0,
  use:{baseURL:'http://127.0.0.1:8765',viewport:{width:1280,height:900},headless:true,screenshot:'only-on-failure',trace:'retain-on-failure',launchOptions:{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']}},
  webServer:{command:'python3 -m http.server 8765 --bind 127.0.0.1',port:8765,reuseExistingServer:false},
  reporter:[['list'],['html',{open:'never'}]]
});
