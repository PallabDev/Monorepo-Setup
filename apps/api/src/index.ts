import express from "express"
import { createUserSchema } from "@minurl/utils"
import cors from "cors"
const app = express();
app.use(express.json());
app.use(cors())
const PORT = 5000;

app.get("/", (req, res) => {
    res.send("Hello World!");
})

app.post("/users", (req, res) => {
    const result = createUserSchema.safeParse(req.body);
    if (!result.success) {
        const messages = result.error.issues.map((issue) => issue.message);
        res.status(400).json({
            success: false,
            messages: messages
        })
    }

    console.log(result.data);
    return res.json({
        success: true,
        message: "User created successfully",
    })
})
app.listen(PORT, () => {
    console.log("Server is running on port " + PORT);
})
