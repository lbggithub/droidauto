/// <reference types="vite/client" />

// 声明 Vue 组件类型
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

// 声明环境变量类型
interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
  readonly VITE_API_URL: string;
  readonly VITE_AI_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
