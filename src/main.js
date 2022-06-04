import Vue from "vue";
import App from "./App.vue";
import "@/style/index.sass";
import "ol/ol.css";

import "element-ui/lib/theme-chalk/index.css";
import loading from "element-ui/lib/loading";
import Message from "element-ui/lib/message";

Vue.prototype.$ELEMENT = { size: "mini" };

Vue.use(loading.directive);
Vue.prototype.$loading = loading.service;
Vue.prototype.$message = Message;

Vue.prototype.$bus = new Vue(); // 事件总线

import contentMenu from "v-contextmenu/src/index.js"; //右键菜单组件
import "v-contextmenu/dist/index.css";

Vue.use(contentMenu);
new Vue({
  render: (h) => h(App)
}).$mount("#app");
