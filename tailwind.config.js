/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Amarillo de la marca (logo)
        brand: {
          50:  '#fffbea',
          100: '#fff3c4',
          200: '#fce588',
          300: '#fadb5f',
          400: '#f7c948',
          500: '#f5c518', // principal
          600: '#d4a313',
          700: '#a8810f',
          800: '#7a5d0a',
          900: '#4a3805'
        },
        // Tinta oscura de la marca (texto del logo)
        ink: {
          50:  '#f7f8fa',
          100: '#eef0f4',
          200: '#d8dce4',
          300: '#b2b9c6',
          400: '#7e8799',
          500: '#56607a',
          600: '#3b4459',
          700: '#2a3245',
          800: '#1e2433',
          900: '#1a1f2c', // color principal del texto del logo
          950: '#10131c'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 19, 28, 0.04), 0 1px 3px rgba(16, 19, 28, 0.06)',
        lift: '0 4px 12px rgba(16, 19, 28, 0.08)'
      }
    }
  },
  plugins: []
};
