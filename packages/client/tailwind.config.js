export default {
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        extend: {
            fontFamily: {
                display: ["'Poppins'", "sans-serif"],
                body: ["'Inter'", "sans-serif"]
            },
            colors: {
                uno: {
                    red: "#ff4d4d",
                    yellow: "#ffd93d",
                    green: "#4caf50",
                    blue: "#2196f3",
                    black: "#1f1f1f"
                }
            }
        }
    },
    plugins: []
};
