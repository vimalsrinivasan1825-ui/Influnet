-- 106: Screenshots on admin issues.
--
-- Nearly every tester report arrives as a screenshot — a chat that failed to
-- connect, a verification card that read wrong, a button that wasn't there.
-- Before this the admin had to describe the picture in prose and keep the
-- image somewhere else, which is exactly the "tracked in an external doc"
-- problem migration 101 set out to remove.
--
-- Stored as an array of Cloudinary secure URLs, not as bytes: uploads already
-- go straight from the browser to Cloudinary via the signed-upload route
-- (/api/uploads/sign), so the database only ever holds the address. The API
-- layer additionally refuses any URL that isn't on res.cloudinary.com, so a
-- row can't be made to embed an arbitrary third-party image.

ALTER TABLE public.admin_issues
  ADD COLUMN IF NOT EXISTS images text[] NOT NULL DEFAULT '{}';

-- A ceiling, not a guess: six screenshots is already more than any single
-- report has needed, and an unbounded array on a row every admin loads is a
-- payload nobody is watching. The API caps it too — this is the backstop for
-- anything that reaches the table another way.
ALTER TABLE public.admin_issues
  DROP CONSTRAINT IF EXISTS admin_issues_images_len;
ALTER TABLE public.admin_issues
  ADD CONSTRAINT admin_issues_images_len
  CHECK (array_length(images, 1) IS NULL OR array_length(images, 1) <= 6);

COMMENT ON COLUMN public.admin_issues.images IS
  'Cloudinary secure URLs for screenshots attached to this issue. Max 6; enforced here and in /api/admin/issues.';
