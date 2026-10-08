import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LuShieldCheck } from "react-icons/lu";
import { RiAlertFill } from "react-icons/ri";

function Login() {
    const navigate = useNavigate();
    const [systemId, setSystemId] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ system_id: systemId, password }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Failed to login");
            }

            // Save token and route to dashboard
            localStorage.setItem("token", data.token);
            navigate("/dashboard");
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans text-zinc-300">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center text-blue-500 mb-2">
                    <LuShieldCheck className="w-16 h-16" />
                </div>
                <h2 className="mt-2 text-center text-3xl font-extrabold text-white tracking-tight">
                    SafeFactory Control
                </h2>
                <p className="mt-2 text-center text-sm text-zinc-400">
                    Sign in with your operational credentials
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-zinc-900 py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-zinc-800 relative overflow-hidden">
                    
                    {error && (
                        <div className="mb-4 bg-red-500/10 border border-red-500/50 p-3 rounded flex items-center gap-3 text-red-400 text-sm">
                            <RiAlertFill className="w-5 h-5 shrink-0" />
                            {error}
                        </div>
                    )}

                    <form className="space-y-6" onSubmit={handleLogin}>
                        <div>
                            <label htmlFor="systemId" className="block text-sm font-medium text-zinc-300">
                                System ID
                            </label>
                            <div className="mt-1">
                                <input
                                    id="systemId"
                                    name="systemId"
                                    type="text"
                                    required
                                    value={systemId}
                                    onChange={(e) => setSystemId(e.target.value)}
                                    className="appearance-none block w-full px-3 py-2 border border-zinc-700 rounded-md shadow-sm placeholder-zinc-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-zinc-950 text-white"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-zinc-300">
                                Password
                            </label>
                            <div className="mt-1">
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="appearance-none block w-full px-3 py-2 border border-zinc-700 rounded-md shadow-sm placeholder-zinc-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-zinc-950 text-white"
                                />
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? "Authenticating..." : "Sign in"}
                            </button>
                        </div>
                    </form>

                    <div className="mt-6">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-zinc-800" />
                            </div>
                            <div className="relative flex justify-center text-sm">
                                <span className="px-2 bg-zinc-900 text-zinc-500">
                                    New personnel?
                                </span>
                            </div>
                        </div>

                        <div className="mt-6 text-center text-sm">
                            <Link to="/signup" className="font-medium text-blue-500 hover:text-blue-400">
                                Register system ID
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Login;