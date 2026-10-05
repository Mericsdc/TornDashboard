import { widget } from '../base';
import { button, el, note, time } from '../../core/dom';
export const travelFavorites = widget({ id: 'travel-favorites', title: 'Travel Favorites', defaultPosition: 'right', defaultOrder: 60, modes: ['NORMAL', 'TRAVEL', 'WAR'] }, context => {
  if (!context.state.favorites.length) return [note('Add favorite items in Options')];
  return context.state.favorites.map(favorite => {
    const stock = context.snapshot?.stocks.find(v => v.itemId === favorite.itemId && v.country === favorite.country && v.name.toLowerCase() === favorite.name.toLowerCase());
    const fresh = stock?.observedAt !== null && stock?.observedAt !== undefined && context.now - stock.observedAt <= (context.snapshot?.provider === 'bosbot' ? 180000 : 15 * 60000);
    const available = fresh && stock?.stock !== null && stock?.stock !== undefined && stock.stock >= favorite.minimumStock;
    const card = el('div', 'favorite-row');
    const head = el('div', 'stat');
    const star = button('★', () => { void context.saveFavorites(context.state.favorites.filter(v => !(v.itemId === favorite.itemId && v.country === favorite.country && v.name.toLowerCase() === favorite.name.toLowerCase()))); });
    star.setAttribute('aria-label', `Remove favorite: ${favorite.name}`); star.className = 'favorite-star';
    const name = el('strong', '', favorite.name); head.append(star, name);
    const badge = el('span', available ? 'badge success' : 'badge', available ? 'IN STOCK' : !fresh ? 'UNKNOWN' : 'OUT OF STOCK');
    card.append(head, el('span', 'muted', favorite.country), badge,
      note(stock?.stock === null || stock?.stock === undefined ? 'Stock: unknown' : `Last observed stock: ${stock.stock.toLocaleString()}`),
      note(stock?.observedAt ? `Last seen ${time(stock.observedAt)}${fresh ? '' : ' · stale'}` : 'No observations'),
      note(favorite.alert ? (available ? '● Alert threshold met' : `◌ Watching threshold ≥ ${favorite.minimumStock}`) : 'Alerts off'));
    return card;
  });
});
