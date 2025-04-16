import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import "./assets/styles.css";

/**
 * 创建 Vue 应用实例
 */
const app = createApp(App);

/**
 * 创建并配置 Pinia 状态管理
 */
const pinia = createPinia();

// 注册 pinia 插件
app.use(pinia);

// 挂载应用到 DOM
app.mount("#app");
