import { useTelegram } from "../hooks/useTelegram";

const Home = () => {
  const { tg, user } = useTelegram();

  return (
    <div className="max-w-screen-sm min-h-screen bg-white shadow-lg rounded-lg py-6 text-center mx-auto">
      <h1 className="text-xl font-bold mb-4">Welcome, {user?.first_name || "Guest"}!</h1>
      <button
        onClick={() => tg.close()}
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition"
      >
        Close App
      </button>
    </div>
  );
}

export default Home;