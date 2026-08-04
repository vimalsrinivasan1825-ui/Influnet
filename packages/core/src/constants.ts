export const NICHES = [
  'Fashion & Beauty',
  'Tech & Gadgets',
  'Food & Cooking',
  'Travel',
  'Fitness & Health',
  'Gaming',
  'Finance',
  'Lifestyle',
  'Education',
  'Entertainment',
  'Sports',
  'Parenting',
  'Home Decor',
  'Art & Design',
  'Music',
  'Comedy',
  'Business',
  'Environment',
];

export const LANGUAGES = [
  'English',
  'Hindi',
  'Tamil',
  'Telugu',
  'Kannada',
  'Malayalam',
  'Marathi',
  'Bengali',
  'Gujarati',
  'Punjabi',
];

export const COLLAB_TYPES = ['Reel', 'Story', 'Post', 'YouTube Video', 'Event Appearance'];

export const PRICE_TIERS = [
  { value: 'entry', label: 'Entry', range: '₹1K – ₹5K' },
  { value: 'standard', label: 'Standard', range: '₹5K – ₹10K' },
  { value: 'premium', label: 'Premium', range: '₹10K – ₹25K' },
  { value: 'pro', label: 'Pro', range: '₹25K+' },
];

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Chandigarh', 'Puducherry',
];

/**
 * Suggestion list for the free-text city field on signup/settings, not an
 * exhaustive gazetteer — the field stays free text so anyone in a town not
 * listed here can still type it. Ordered roughly by population so the
 * biggest, most-likely-to-match cities show first when a prefix matches many.
 */
export const INDIAN_CITIES = [
  'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Ahmedabad', 'Chennai',
  'Kolkata', 'Surat', 'Pune', 'Jaipur', 'Lucknow', 'Kanpur', 'Nagpur',
  'Indore', 'Thane', 'Bhopal', 'Visakhapatnam', 'Patna', 'Vadodara',
  'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik', 'Faridabad', 'Meerut',
  'Rajkot', 'Kalyan', 'Vasai-Virar', 'Varanasi', 'Srinagar', 'Aurangabad',
  'Dhanbad', 'Amritsar', 'Navi Mumbai', 'Allahabad', 'Ranchi', 'Howrah',
  'Coimbatore', 'Jabalpur', 'Gwalior', 'Vijayawada', 'Jodhpur', 'Madurai',
  'Raipur', 'Kota', 'Guwahati', 'Chandigarh', 'Thiruvananthapuram',
  'Solapur', 'Hubballi-Dharwad', 'Bareilly', 'Moradabad', 'Mysuru',
  'Gurugram', 'Aligarh', 'Jalandhar', 'Tiruchirappalli', 'Bhubaneswar',
  'Salem', 'Warangal', 'Mira-Bhayandar', 'Thiruvottiyur', 'Bhiwandi',
  'Saharanpur', 'Guntur', 'Amravati', 'Bikaner', 'Noida', 'Jamshedpur',
  'Bhilai', 'Cuttack', 'Firozabad', 'Kochi', 'Nellore', 'Bhavnagar',
  'Dehradun', 'Durgapur', 'Asansol', 'Rourkela', 'Nanded', 'Kolhapur',
  'Ajmer', 'Akola', 'Gulbarga', 'Jamnagar', 'Ujjain', 'Loni', 'Siliguri',
  'Jhansi', 'Ulhasnagar', 'Jammu', 'Sangli-Miraj', 'Mangaluru', 'Erode',
  'Belagavi', 'Kurnool', 'Udaipur', 'Maheshtala', 'Davanagere', 'Kozhikode',
  'Tirupati', 'Panipat', 'Karnal', 'Rohtak', 'Shimla', 'Puducherry',
  'Gandhinagar', 'Goa', 'Panaji', 'Imphal', 'Shillong', 'Aizawl',
  'Kohima', 'Itanagar', 'Gangtok', 'Agartala', 'Dispur', 'Vellore',
  'Thoothukudi', 'Rajahmundry', 'Bokaro', 'Muzaffarpur', 'Bhagalpur',
  'Gaya', 'Muzaffarnagar', 'Bathinda', 'Patiala', 'Rewa', 'Satna',
  'Sagar', 'Bhilwara', 'Alwar', 'Sikar', 'Anantapur', 'Nizamabad',
  'Karimnagar', 'Ramagundam', 'Ongole', 'Eluru', 'Kadapa', 'Kakinada',
  'Kannur', 'Kollam', 'Thrissur', 'Alappuzha', 'Palakkad', 'Malappuram',
];

export const INDUSTRIES = [
  'Fashion & Apparel', 'Beauty & Personal Care', 'Food & Beverage', 'Technology',
  'Healthcare & Wellness', 'Finance', 'Education', 'Travel & Hospitality',
  'Home & Lifestyle', 'Automotive', 'Entertainment & Media', 'Sports & Fitness',
  'Real Estate', 'Other',
];

export const BUSINESS_TYPES = [
  'Startup', 'SME', 'Enterprise', 'Agency', 'D2C Brand', 'E-commerce',
  'NGO / Non-profit', 'Freelancer / Solo', 'Other',
];

export const BUDGET_RANGES = [
  'Under ₹25K/month', '₹25K – ₹50K', '₹50K – ₹1L', '₹1L – ₹5L', '₹5L – ₹10L', '₹10L+', 'Other',
];
