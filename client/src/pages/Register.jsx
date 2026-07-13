import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Register() {
  const navigate = useNavigate();
  const { applyToken } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      const res = await apiClient.post('/auth/register', { name, email, password });
      applyToken(res.data.token);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Register</h1>
      <label htmlFor="register-name">Name</label>
      <input id="register-name" value={name} onChange={(e) => setName(e.target.value)} required />

      <label htmlFor="register-email">Email</label>
      <input id="register-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />

      <label htmlFor="register-password">Password</label>
      <input id="register-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />

      {error && <p role="alert">{error}</p>}

      <button type="submit">Register</button>
      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </form>
  );
}
