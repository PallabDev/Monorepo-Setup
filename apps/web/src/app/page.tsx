"use client"
import { useState } from "react";
import { createUserSchema } from "@minurl/utils"
import type { SubmitEvent } from "react"
import axios from "axios";



export default function Home() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");


    const [error, setError] = useState<string[]>([]);
    const [success, setSuccess] = useState("");


    const handleSubmit = async (E: SubmitEvent) => {
        setError([]);
        setSuccess("");
        E.preventDefault();
        const result = createUserSchema.safeParse({ name, email, password });
        if (!result.success) {
            const messages = result.error.issues.map((issue) => issue.message);
            setError(messages);
        } else {
            try {
                const response = await axios.post("http://localhost:5000/users", result.data);
                setSuccess("User Created Successfully");
            } catch (error: any) {
                console.error("Error creating user:", error);
            }
        }


    }
    return (
        <main className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
            <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4 rounded-xl border border-foreground/10 bg-background p-8 shadow-md" noValidate={true}>
                <h1 className="text-center text-2xl font-bold">Create User</h1>
                <input className="w-full rounded-lg border border-foreground/20 bg-background px-4 py-2 outline-none placeholder:text-foreground/40 focus:border-foreground focus:ring-1 focus:ring-foreground" type="text" placeholder="John Doe" value={name} onChange={(e) => setName(e.target.value)} />
                <input className="w-full rounded-lg border border-foreground/20 bg-background px-4 py-2 outline-none placeholder:text-foreground/40 focus:border-foreground focus:ring-1 focus:ring-foreground" type="email" placeholder="john@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <input className="w-full rounded-lg border border-foreground/20 bg-background px-4 py-2 outline-none placeholder:text-foreground/40 focus:border-foreground focus:ring-1 focus:ring-foreground" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
                {error && error.map((msg, index) => (
                    <p key={index} className="text-sm opacity-80">
                        {msg}
                    </p>
                ))}
                {success && (
                    <p className="text-sm opacity-80">{success}</p>
                )}
                <button className="w-full rounded-lg bg-foreground py-2 font-medium text-background transition hover:opacity-90" type="submit">Submit</button>
            </form>
        </main >
    );
}
