import pluginVue from 'eslint-plugin-vue'
import vueTsEslintConfig from '@vue/eslint-config-typescript'

export default [
  {
    name: 'app/files-to-lint',
    files: ['**/*.{ts,mts,tsx,vue}'],
  },

  {
    name: 'app/files-to-ignore',
    ignores: ['**/dist/**', '**/dist-ssr/**', '**/coverage/**'],
  },

  ...pluginVue.configs['flat/essential'],
  ...vueTsEslintConfig(),

  // 💡 新增：自定义规则放行，防止因为 any 强转或开发调试日志导致打包被强行终止
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // 允许我们在环境 Mock 中优雅地使用 any
      '@typescript-eslint/no-unused-vars': 'warn', // 未使用变量仅警告，不阻断打包
      'no-console': 'off' // 允许保留 console.log 方便我们在 Eruda 中看区块链流水对账
    }
  }
]