
export function LogoutButton() {
  return (
    <form action="/auth/signout" method="post">
      <button className="btn btn-secondary" type="submit">Déconnexion</button>
    </form>
  );
}
