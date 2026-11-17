python_code = '''
path = "/Users/trinhhao/Antigravity/ota-hotel/app/[locale]/page.tsx"
with open(path) as f: c = f.read()

# Clean imports
old_imports = """import { type Locale } from '@/i18n/config';
import { getDictionary } from '@/lib/getDictionary';
import { generatePageMetadata } from '@/lib/metadata';
import Navbar from '@/app/components/layout/Navbar';
import Link from 'next/link';
import { getCmsPosts } from '@/lib/cms';
import Link from 'next/link';
import { getCmsPosts } from '@/lib/cms';
import Footer from '@/app/components/layout/Footer';
import { FAQPageJsonLd } from '@/app/components/JsonLd';
import type { Metadata } from 'next';"""

clean_imports = """import { type Locale } from '@/i18n/config';
import { getDictionary } from '@/lib/getDictionary';
import { generatePageMetadata } from '@/lib/metadata';
import Navbar from '@/app/components/layout/Navbar';
import Link from 'next/link';
import { getCmsPosts } from '@/lib/cms';
import Footer from '@/app/components/layout/Footer';
import { FAQPageJsonLd } from '@/app/components/JsonLd';
import type { Metadata } from 'next';"""

c = c.replace(old_imports, clean_imports, 1)

# Clean generateMetadata
old_meta = """export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);
  const posts = await getCmsPosts(3);
  const posts = await getCmsPosts(3);
  return generatePageMetadata({"""

clean_meta = """export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getDictionary(locale as Locale);
  return generatePageMetadata({"""

c = c.replace(old_meta, clean_meta, 1)

with open(path, 'w') as f: f.write(c)
print("CLEANED_OK")
'''
exec(python_code)
