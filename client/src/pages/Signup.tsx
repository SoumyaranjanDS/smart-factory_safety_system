import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { LuShieldCheck } from "react-icons/lu";
import { RiAlertFill } from "react-icons/ri";

function Signup() {
    const navigate = useNavigate();
    const [systemId, setSystemId] = useState("");
    const [password, setPassword] = useState("");
    const [role, setRole] = useState("Manager");
    const [error, setError] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setIsLoading(true);

        try {
            const response = await fetch("/api/auth/signup", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ system_id: systemId, password, role }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Failed to sign up");
            }

            // Successfully signed up, route to login
            navigate("/");
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
                    System Initialization
                </h2>
                <p className="mt-2 text-center text-sm text-zinc-400">
                    Register new operating personnel
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

                    <form className="space-y-6" onSubmit={handleSignup}>
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
                                    placeholder="e.g. OP-001"
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
                            <label htmlFor="role" className="block text-sm font-medium text-zinc-300">
                                Access Level (Role)
                            </label>
                            <div className="mt-1">
                                <select
                                    id="role"
                                    name="role"
                                    value={role}
                                    onChange={(e) => setRole(e.target.value)}
                                    className="block w-full px-3 py-2 border border-zinc-700 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm bg-zinc-950 text-white"
                                >
                                    <option value="Manager">Manager</option>
                                    <option value="Supervisor">Supervisor</option>
                                    <option value="Others">Others</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isLoading ? "Registering..." : "Register"}
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
                                    Already registered?
                                </span>
                            </div>
                        </div>

                        <div className="mt-6 text-center text-sm">
                            <Link to="/" className="font-medium text-blue-500 hover:text-blue-400">
                                Log in to system
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Signup;
