import { useState, useRef, useEffect } from 'react';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';

export default function AddressSearch({ id, value, onChange, onPick, placeholder = 'Search address...' }) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleChange(e) {
    const val = e.target.value;
    setQuery(val);
    onChange(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (val.length < 1) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${NOMINATIM_URL}?q=${encodeURIComponent(val)}&format=json&limit=5&countrycodes=id`
        );
        const data = await res.json();
        setSuggestions(data);
        setOpen(data.length > 0);
      } catch {
        setSuggestions([]);
      }
    }, 300);
  }

  function handleSelect(item) {
    setQuery(item.display_name);
    onChange(item.display_name);
    onPick({ lat: parseFloat(item.lat), lng: parseFloat(item.lon) });
    setOpen(false);
  }

  return (
    <div className="address-search" ref={wrapperRef}>
      <input
        id={id}
        type="text"
        value={query}
        onChange={handleChange}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <div className="address-search-dropdown">
          {suggestions.map((item, idx) => (
            <div
              key={item.place_id || idx}
              className="address-search-item"
              onClick={() => handleSelect(item)}
            >
              {item.display_name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
